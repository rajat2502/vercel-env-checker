const fs = require('fs');
const path = require('path');
const os = require('os');

class Config {
  constructor() {
    this.configDir = path.join(os.homedir(), '.vercel-env-checker');
    this.configFile = path.join(this.configDir, 'config.json');
    this.cacheDir = path.join(this.configDir, 'cache');
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading config:', error.message);
    }
    return {};
  }

  save(config) {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save config: ${error.message}`);
    }
  }

  getToken() {
    const config = this.load();
    // Also check environment variable
    return process.env.VERCEL_TOKEN || config.token;
  }

  setToken(token) {
    const config = this.load();
    config.token = token;
    this.save(config);
  }

  clearToken() {
    const config = this.load();
    delete config.token;
    this.save(config);
  }

  getCache(key) {
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, 'utf8');
        const cache = JSON.parse(data);
        // Check if cache is still valid (1 hour)
        if (Date.now() - cache.timestamp < 3600000) {
          return cache.data;
        }
      }
    } catch (error) {
      // Cache miss or error
    }
    return null;
  }

  setCache(key, data) {
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

  clearCache() {
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

module.exports = Config;
