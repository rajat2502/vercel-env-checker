import Config from './config';
import { Project, EnvVar } from './types';

class VercelAPI {
  private config: Config;
  private baseURL: string;

  constructor() {
    this.config = new Config();
    this.baseURL = 'https://api.vercel.com';
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

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const url = `${this.baseURL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; error?: { message?: string } };
      throw new Error(`API Error (${response.status}): ${error.message || error.error?.message || 'Unknown error'}`);
    }

    return response.json() as Promise<T>;
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
    interface EnvResponse {
      envs: EnvVar[];
    }
    
    const data = await this.request<EnvResponse>(`/v9/projects/${projectId}/env`);
    let envs = data.envs || [];
    
    if (targetFilter) {
      envs = envs.filter(env => env.target.includes(targetFilter));
    }
    
    if (includeValues) {
      for (const env of envs) {
        if (env.type === 'encrypted' || !env.value) {
          try {
            const details = await this.getEnvVarDetails(projectId, env.id || '');
            if (details.value) {
              env.value = details.value;
            }
          } catch (e) {
            // Value might not be accessible
          }
        }
      }
    }
    
    return envs;
  }

  private async getEnvVarDetails(projectId: string, envId: string): Promise<EnvVar> {
    return this.request<EnvVar>(`/v9/projects/${projectId}/env/${envId}`);
  }

  async validateToken(token: string): Promise<boolean> {
    const response = await fetch(`${this.baseURL}/v2/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.ok;
  }
}

export default VercelAPI;
