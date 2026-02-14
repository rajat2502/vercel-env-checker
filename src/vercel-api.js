const Config = require('./config');

class VercelAPI {
  constructor() {
    this.config = new Config();
    this.baseURL = 'https://api.vercel.com';
  }

  getToken() {
    const token = this.config.getToken();
    if (!token) {
      throw new Error(
        'No Vercel token found. Please run "vercel-env-checker login" or set VERCEL_TOKEN environment variable.'
      );
    }
    return token;
  }

  async request(endpoint, options = {}) {
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
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`API Error (${response.status}): ${error.message || error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  async getUser() {
    return this.request('/v2/user');
  }

  async getProjects(limit = 100) {
    const projects = [];
    let next = null;
    
    do {
      const params = new URLSearchParams({ limit: Math.min(limit, 100).toString() });
      if (next) params.append('until', next);
      
      const data = await this.request(`/v9/projects?${params}`);
      projects.push(...(data.projects || []));
      
      if (projects.length >= limit) break;
      next = data.pagination?.next;
    } while (next && projects.length < limit);

    return projects.slice(0, limit);
  }

  async getProject(projectId) {
    return this.request(`/v9/projects/${projectId}`);
  }

  async getEnvVars(projectId, includeValues = false, targetFilter = null) {
    const data = await this.request(`/v9/projects/${projectId}/env`);
    let envs = data.envs || [];
    
    // Filter by target if specified
    if (targetFilter) {
      envs = envs.filter(env => env.target.includes(targetFilter));
    }
    
    // If values are requested and encrypted, try to fetch individual values
    if (includeValues) {
      for (let env of envs) {
        if (env.type === 'encrypted' || !env.value) {
          try {
            const details = await this.getEnvVarDetails(projectId, env.id);
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

  async getEnvVarDetails(projectId, envId) {
    return this.request(`/v9/projects/${projectId}/env/${envId}`);
  }

  async validateToken(token) {
    const response = await fetch(`${this.baseURL}/v2/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return false;
    }

    return true;
  }
}

module.exports = VercelAPI;
