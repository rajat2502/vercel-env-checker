#!/usr/bin/env node

const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const VercelEnvChecker = require(path.join(__dirname, '../src/index'));
const pkg = require(path.join(__dirname, '../package.json'));

const checker = new VercelEnvChecker();

program
  .name('vercel-env-checker')
  .description('CLI tool to search inside environment variable values across Vercel projects')
  .version(pkg.version);

program
  .command('login')
  .description('Authenticate with Vercel using a token')
  .option('-t, --token <token>', 'Vercel API token')
  .action(async (options) => {
    try {
      await checker.login(options.token);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('logout')
  .description('Remove stored Vercel authentication')
  .action(async () => {
    try {
      await checker.logout();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('check-value')
  .alias('val')
  .description('Search for text inside environment variable values')
  .argument('<query>', 'Text to search for inside env values (e.g., "postgres://", "stripe.com")')
  .option('-t, --target <target>', 'Filter by environment: production, preview, or development')
  .action(async (query, options) => {
    try {
      const projects = await checker.getProjectsList();
      await checker.searchByValueInProjects(query, options.target, projects);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse();
