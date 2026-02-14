import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ConfigData {
  token?: string;
}

interface CacheData<T> {
  timestamp: number;
  data: T;
}

class Config {
  private configDir: string;
  private configFile: string;
  private cacheDir: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.vercel-env-checker');
    this.configFile = path.join(this.configDir, 'config.json');
    this.cacheDir = path.join(this.configDir, 'cache');
    this.ensureConfigDir();
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  load(): ConfigData {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        return JSON.parse(data) as ConfigData;
      }
    } catch (error) {
      console.error('Error loading config:', (error as Error).message);
    }
    return {};
  }

  save(config: ConfigData): void {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save config: ${(error as Error).message}`);
    }
  }

  getToken(): string | undefined {
    const config = this.load();
    return process.env.VERCEL_TOKEN || config.token;
  }

  setToken(token: string): void {
    const config = this.load();
    config.token = token;
    this.save(config);
  }

  clearToken(): void {
    const config = this.load();
    delete config.token;
    this.save(config);
  }

  getCache<T>(key: string): T | null {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, 'utf8');
        const cache = JSON.parse(data) as CacheData<T>;
        if (Date.now() - cache.timestamp < 3600000) {
          return cache.data;
        }
      }
    } catch (error) {
      // Cache miss or error
    }
    return null;
  }

  setCache<T>(key: string, data: T): void {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify({
        timestamp: Date.now(),
        data
      }, null, 2));
    } catch (error) {
      // Silent fail for cache
    }
  }

  clearCache(): void {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true });
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (error) {
      // Silent fail
    }
  }
}

export default Config;
