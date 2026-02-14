#!/usr/bin/env node

import * as path from 'path';
import { program } from 'commander';
import chalk from 'chalk';
import VercelEnvChecker from '../src/index';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require(path.join(__dirname, '../package.json'));

const checker = new VercelEnvChecker();

program
  .name('vercel-env-checker')
  .description('CLI tool to search inside environment variable values across Vercel projects')
  .version(pkg.version);

program
  .command('login')
  .description('Authenticate with Vercel using an API token')
  .option('-t, --token <token>', 'Vercel API token')
  .action(async (options: { token?: string }) => {
    try {
      await checker.login(options.token);
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Remove stored authentication and clear all data')
  .action(async () => {
    try {
      await checker.logout();
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('check-value')
  .alias('val')
  .description('Search for text within environment variable values')
  .argument('<query>', 'Text to search for within environment variable values (e.g., "postgres://", "stripe.com")')
  .option('-t, --target <target>', 'Filter by environment: production, preview, or development')
  .action(async (query: string, options: { target?: string }) => {
    try {
      const projects = await checker.getProjectsList();
      await checker.searchByValueInProjects(query, options.target || null, projects);
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
