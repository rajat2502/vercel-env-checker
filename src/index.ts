import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import pLimit from 'p-limit';
import Config from './config';
import VercelAPI from './vercel-api';
import { Project, EnvVar, MatchResult } from './types';

// Concurrency limits for project processing
const PROJECT_CONCURRENCY = 5;

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
        console.log(chalk.yellow('Please provide a token:'));
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
        throw new Error('Invalid token. Please check and try again.');
      }

      await this.config.setToken(token);
      spinner.succeed('Successfully authenticated!');
      
    } catch (error) {
      spinner.stop();
      throw error;
    }
  }

  async logout(): Promise<void> {
    await this.config.clearToken();
    await this.config.clearCache();
    console.log(chalk.green('Successfully logged out and cleared all data.'));
  }

  async getProjectsList(limit = 100): Promise<Project[]> {
    const cacheKey = `projects_${limit}`;
    let projects = await this.config.getCache<Project[]>(cacheKey);
    
    if (!projects) {
      projects = await this.api.getProjects(limit);
      await this.config.setCache(cacheKey, projects);
    }
    
    return projects;
  }

  async searchByValueInProjects(valueQuery: string, target: string | null, projects: Project[]): Promise<void> {
    const spinner = ora(`Searching environment variable values${target ? ` (${target})` : ''} in ${projects.length} selected project(s)...`).start();
    
    try {
      const results: MatchResult[] = [];
      const limit = pLimit(PROJECT_CONCURRENCY);
      let searchedCount = 0;

      // Create search tasks for all projects
      const searchTasks = projects.map(project => 
        limit(async () => {
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
              return {
                project: project.name,
                matches: matches,
              };
            }
            return null;
          } catch (e) {
            // Skip projects that fail
            return null;
          }
        })
      );

      // Execute all search tasks in parallel with concurrency control
      const searchResults = await Promise.all(searchTasks);
      
      // Filter out null results
      for (const result of searchResults) {
        if (result) {
          results.push(result);
        }
      }

      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow(`\nNo environment variables with values containing "${valueQuery}"${target ? ` (${target})` : ''} were found in the selected projects.`));
        return;
      }

      const totalMatches = results.reduce((acc, r) => acc + r.matches.length, 0);
      const variableWord = totalMatches === 1 ? 'variable' : 'variables';
      console.log(chalk.bold(`\n🔍 Found ${totalMatches} ${variableWord}${target ? ` (${target})` : ''} with values containing "${valueQuery}":`));

      results.forEach((result: MatchResult) => {
        console.log(chalk.cyan(`\n📁 ${result.project}:`));
        const table = new Table({
          head: [chalk.bold('Key'), chalk.bold('Value'), chalk.bold('Target')],
          colWidths: [55, 55, 50],
        });

        result.matches.forEach((match: EnvVar) => {
          table.push([
            match.key,
            match.value || '',
            match.target.join(', '),
          ]);
        });

        console.log(table.toString());
      });
      
      console.log(chalk.gray('\n⚠️  Note: Some values may be encrypted and inaccessible via the API.'));
      
    } catch (error) {
      spinner.fail('Failed to search environment variable values.');
      throw error;
    }
  }
}

export default VercelEnvChecker;
