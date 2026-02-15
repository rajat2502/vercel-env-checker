import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ConfigData {
  token?: string;
}

interface CacheData<T> {
  timestamp: number;
  data: T;
  ttl?: number; // TTL in milliseconds, defaults to 1 hour if not specified
}

class Config {
  private configDir: string;
  private configFile: string;
  private cacheDir: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.vercel-env-checker');
    this.configFile = path.join(this.configDir, 'config.json');
    this.cacheDir = path.join(this.configDir, 'cache');
  }

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.configDir, { recursive: true });
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async load(): Promise<ConfigData> {
    try {
      await this.ensureConfigDir();
      const data = await fs.promises.readFile(this.configFile, 'utf8');
      return JSON.parse(data) as ConfigData;
    } catch (error) {
      // File doesn't exist or is invalid
      return {};
    }
  }

  async save(config: ConfigData): Promise<void> {
    try {
      await this.ensureConfigDir();
      await fs.promises.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save config: ${(error as Error).message}`);
    }
  }

  getToken(): string | undefined {
    // Keep sync for backward compatibility with non-async contexts
    // Environment variable check is synchronous
    if (process.env.VERCEL_TOKEN) {
      return process.env.VERCEL_TOKEN;
    }
    
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(data) as ConfigData;
        return config.token;
      }
    } catch (error) {
      // Silent fail
    }
    return undefined;
  }

  async setToken(token: string): Promise<void> {
    const config = await this.load();
    config.token = token;
    await this.save(config);
  }

  async clearToken(): Promise<void> {
    const config = await this.load();
    delete config.token;
    await this.save(config);
  }

  async getCache<T>(key: string): Promise<T | null> {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      const data = await fs.promises.readFile(cacheFile, 'utf8');
      const cache = JSON.parse(data) as CacheData<T>;
      // Use stored TTL or default to 1 hour (3600000 ms)
      const ttl = cache.ttl ?? 3600000;
      if (Date.now() - cache.timestamp < ttl) {
        return cache.data;
      }
      // Expired cache, delete it
      await fs.promises.unlink(cacheFile).catch(() => {});
    } catch (error) {
      // Cache miss or error
    }
    return null;
  }

  async setCache<T>(key: string, data: T, ttlMs?: number): Promise<void> {
    await this.ensureConfigDir();
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      const cacheData: CacheData<T> = {
        timestamp: Date.now(),
        data
      };
      if (ttlMs !== undefined) {
        cacheData.ttl = ttlMs;
      }
      await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      // Silent fail for cache
    }
  }

  async clearCache(): Promise<void> {
    try {
      const exists = await fs.promises.access(this.cacheDir).then(() => true).catch(() => false);
      if (exists) {
        await fs.promises.rm(this.cacheDir, { recursive: true });
        await fs.promises.mkdir(this.cacheDir, { recursive: true });
      }
    } catch (error) {
      // Silent fail
    }
  }
}

export default Config;
