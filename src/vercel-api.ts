import pLimit from 'p-limit';
import Config from './config';
import { Project, EnvVar } from './types';

// Rate limiting configuration
// Vercel API typically allows 100 requests per minute for most endpoints
// We'll use conservative limits to stay well under the threshold
const RATE_LIMIT = {
  maxConcurrent: 5,           // Max 5 concurrent requests
  minDelayMs: 100,           // Minimum 100ms between requests (10 req/sec max)
  retryAttempts: 3,          // Retry failed requests up to 3 times
  retryDelayMs: 1000,        // Wait 1 second before retry
};

// Cache TTL for env vars (5 minutes)
const ENV_CACHE_TTL = 5 * 60 * 1000;

class VercelAPI {
  private config: Config;
  private baseURL: string;
  private limit: ReturnType<typeof pLimit>;
  private lastRequestTime: number = 0;

  constructor() {
    this.config = new Config();
    this.baseURL = 'https://api.vercel.com';
    this.limit = pLimit(RATE_LIMIT.maxConcurrent);
  }

  private getToken(): string {
    const token = this.config.getToken();
    if (!token) {
      throw new Error(
        'No Vercel token found. Please run "vercel-env-checker login" or set VERCEL_TOKEN environment variable.'
      );
    }
    return token;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < RATE_LIMIT.minDelayMs) {
      const waitTime = RATE_LIMIT.minDelayMs - timeSinceLastRequest;
      await this.delay(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, attempt = 1): Promise<T> {
    return this.limit(async () => {
      await this.enforceRateLimit();
      
      const token = this.getToken();
      const url = `${this.baseURL}${endpoint}`;
      
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        } as RequestInit);

        if (!response.ok) {
          // Handle rate limiting (429) with exponential backoff
          if (response.status === 429 && attempt < RATE_LIMIT.retryAttempts) {
            const retryDelay = RATE_LIMIT.retryDelayMs * Math.pow(2, attempt - 1);
            console.warn(`Rate limited. Retrying in ${retryDelay}ms... (attempt ${attempt}/${RATE_LIMIT.retryAttempts})`);
            await this.delay(retryDelay);
            return this.request<T>(endpoint, options, attempt + 1);
          }
          
          const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; error?: { message?: string } };
          throw new Error(`API Error (${response.status}): ${error.message || error.error?.message || 'Unknown error'}`);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        // Retry on network errors
        if (attempt < RATE_LIMIT.retryAttempts && (error as Error).message?.includes('fetch')) {
          const retryDelay = RATE_LIMIT.retryDelayMs * Math.pow(2, attempt - 1);
          console.warn(`Request failed. Retrying in ${retryDelay}ms... (attempt ${attempt}/${RATE_LIMIT.retryAttempts})`);
          await this.delay(retryDelay);
          return this.request<T>(endpoint, options, attempt + 1);
        }
        throw error;
      }
    });
  }

  async getUser(): Promise<unknown> {
    return this.request('/v2/user');
  }

  async getProjects(limit = 100): Promise<Project[]> {
    const projects: Project[] = [];
    let next: string | null = null;
    
    do {
      const params = new URLSearchParams({ limit: Math.min(limit, 100).toString() });
      if (next) params.append('until', next);
      
      interface ProjectsResponse {
        projects: Project[];
        pagination?: { next?: string };
      }
      
      const data = await this.request<ProjectsResponse>(`/v9/projects?${params}`);
      projects.push(...(data.projects || []));
      
      if (projects.length >= limit) break;
      next = data.pagination?.next || null;
    } while (next && projects.length < limit);

    return projects.slice(0, limit);
  }

  async getProject(projectId: string): Promise<Project> {
    return this.request<Project>(`/v9/projects/${projectId}`);
  }

  async getEnvVars(projectId: string, includeValues = false, targetFilter: string | null = null): Promise<EnvVar[]> {
    // Check cache first (cache key includes projectId and whether values are included)
    const cacheKey = `envvars_${projectId}_${includeValues}`;
    const cached = await this.config.getCache<EnvVar[]>(cacheKey);
    
    // Use cached data if it's still fresh (using shorter TTL for env vars)
    let envs: EnvVar[];
    if (cached) {
      envs = cached;
    } else {
      interface EnvResponse {
        envs: EnvVar[];
      }
      
      const data = await this.request<EnvResponse>(`/v9/projects/${projectId}/env`);
      envs = data.envs || [];
      
      // Cache the raw env vars before filtering (with 5 minute TTL for env vars)
      await this.config.setCache(cacheKey, envs, ENV_CACHE_TTL);
    }
    
    // Apply target filter (always do this, even with cached data)
    let filteredEnvs = envs;
    if (targetFilter) {
      filteredEnvs = envs.filter(env => env.target.includes(targetFilter));
    }
    
    if (includeValues) {
      // Fetch encrypted values in parallel with concurrency control
      const encryptedEnvs = filteredEnvs.filter(env => env.type === 'encrypted' || !env.value);
      
      if (encryptedEnvs.length > 0) {
        // Use a separate limiter for detail fetching to avoid blocking other requests
        const detailLimit = pLimit(3); // More conservative for detail fetching
        
        const detailPromises = encryptedEnvs.map(env => 
          detailLimit(async () => {
            if (!env.id) return null;
            try {
              const details = await this.getEnvVarDetails(projectId, env.id);
              return { env, details };
            } catch (e) {
              // Value might not be accessible
              return null;
            }
          })
        );
        
        const results = await Promise.all(detailPromises);
        
        // Update envs with fetched details
        for (const result of results) {
          if (result && result.details.value) {
            result.env.value = result.details.value;
          }
        }
      }
    }
    
    return filteredEnvs;
  }

  private async getEnvVarDetails(projectId: string, envId: string): Promise<EnvVar> {
    return this.request<EnvVar>(`/v9/projects/${projectId}/env/${envId}`);
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/v2/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  // Helper method to process multiple projects with rate limiting
  async processProjects<T>(
    projects: Project[],
    processor: (project: Project) => Promise<T>,
    concurrency = RATE_LIMIT.maxConcurrent
  ): Promise<T[]> {
    const projectLimit = pLimit(concurrency);
    const promises = projects.map(project => 
      projectLimit(() => processor(project))
    );
    return Promise.all(promises);
  }
}

export default VercelAPI;
