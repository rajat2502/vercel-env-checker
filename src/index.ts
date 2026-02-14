import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import Config from './config';
import VercelAPI from './vercel-api';
import { Project, EnvVar, MatchResult } from './types';

class VercelEnvChecker {
  private config: Config;
  private api: VercelAPI;

  constructor() {
    this.config = new Config();
    this.api = new VercelAPI();
  }

  async login(providedToken?: string): Promise<void> {
    const spinner = ora('Validating token...').start();
    
    try {
      let token = providedToken;
      
      if (!token) {
        spinner.stop();
        console.log(chalk.yellow('Please provide a Vercel token:'));
        console.log(chalk.gray('You can create one at https://vercel.com/account/tokens'));
        
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        token = await new Promise<string>((resolve) => {
          rl.question('Token: ', (answer: string) => {
            rl.close();
            resolve(answer.trim());
          });
        });
        
        if (!token) {
          throw new Error('Token is required');
        }
        
        spinner.start('Validating token...');
      }

      const isValid = await this.api.validateToken(token);
      
      if (!isValid) {
        spinner.fail('Invalid token');
        throw new Error('Invalid Vercel token. Please check and try again.');
      }

      this.config.setToken(token);
      spinner.succeed('Successfully authenticated with Vercel!');
      
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }

  async logout(): Promise<void> {
    this.config.clearToken();
    this.config.clearCache();
    console.log(chalk.green('Successfully logged out and cleared all data.'));
  }

  async getProjectsList(limit = 100): Promise<Project[]> {
    const cacheKey = `projects_${limit}`;
    let projects = this.config.getCache<Project[]>(cacheKey);
    
    if (!projects) {
      projects = await this.api.getProjects(limit);
      this.config.setCache(cacheKey, projects);
    }
    
    return projects;
  }

  async searchByValueInProjects(valueQuery: string, target: string | null, projects: Project[]): Promise<void> {
    const spinner = ora(`Searching environment variable values${target ? ` (${target})` : ''} in ${projects.length} selected project(s)...`).start();
    
    try {
      const results: MatchResult[] = [];
      let searchedCount = 0;

      for (const project of projects) {
        try {
          searchedCount++;
          spinner.text = `Searching values${target ? ` (${target})` : ''}... (${searchedCount}/${projects.length} projects)`;
          
          const envVars = await this.api.getEnvVars(project.id, true, target);
          const matches = envVars.filter((env: EnvVar) => {
            if (env.value) {
              return env.value.toLowerCase().includes(valueQuery.toLowerCase());
            }
            return false;
          });
          
          if (matches.length > 0) {
            results.push({
              project: project.name,
              matches: matches,
            });
          }
        } catch (e) {
          // Skip projects that fail
        }
      }

      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow(`\nNo environment variables with values containing "${valueQuery}"${target ? ` (${target})` : ''} found in selected projects.`));
        return;
      }

      console.log(chalk.bold(`\n🔍 Found ${results.reduce((acc, r) => acc + r.matches.length, 0)} variable(s)${target ? ` (${target})` : ''} with values containing "${valueQuery}":\n`));

      results.forEach((result: MatchResult) => {
        console.log(chalk.cyan(`\n📁 ${result.project}:`));
        const table = new Table({
          head: [chalk.bold('Key'), chalk.bold('Value (partial)'), chalk.bold('Target')],
          colWidths: [30, 50, 15],
        });

        result.matches.forEach((match: EnvVar) => {
          const value = match.value || '';
          const partialValue = value.length > 40 
            ? value.substring(0, 20) + '...' + value.substring(value.length - 10)
            : value;
          
          table.push([
            match.key,
            partialValue,
            match.target.join(', '),
          ]);
        });

        console.log(table.toString());
      });
      
      console.log(chalk.gray('\n⚠️  Note: Some values may be encrypted and not accessible via API'));
      
    } catch (error) {
      spinner.fail('Failed to search environment variable values');
      throw error;
    }
  }
}

export default VercelEnvChecker;
