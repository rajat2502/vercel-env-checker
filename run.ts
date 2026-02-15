#!/usr/bin/env node

import { execSync } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import VercelEnvChecker from './src/index';
import { Project } from './src/types';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

function isLoggedIn(): boolean {
  const configDir = path.join(os.homedir(), '.vercel-env-checker');
  const configFile = path.join(configDir, 'config.json');
  
  if (fs.existsSync(configFile)) {
    try {
      interface ConfigData {
        token?: string;
      }
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8')) as ConfigData;
      return !!config.token;
    } catch (e) {
      return false;
    }
  }
  return false;
}

async function getToken(): Promise<string | null> {
  if (process.env.VERCEL_TOKEN) {
    return process.env.VERCEL_TOKEN;
  }
  
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const tokenMatch = envContent.match(/VERCEL_TOKEN=(.+)/);
    if (tokenMatch) {
      return tokenMatch[1].trim();
    }
  }
  
  return null;
}

const totalSteps = 5;

function printStep(stepNum: number, title: string): void {
  console.log(chalk.bold(`Step ${stepNum}/${totalSteps}: ${title}`));
}

function printProgress(): void {
  console.log(chalk.dim('─'.repeat(60)));
}

async function login(): Promise<boolean> {
  const token = await getToken();
  
  if (token) {
    console.log(chalk.gray('  Using token from environment...'));
    try {
      execSync(`node dist/bin/cli.js login -t ${token}`, { stdio: 'inherit' });
      return true;
    } catch (e) {
      console.log(chalk.yellow('  ⚠ Auto-login failed. Please enter your token manually.\n'));
    }
  }
  
  console.log(chalk.gray('  You can obtain a token from: https://vercel.com/account/tokens'));
  const manualToken = await question(chalk.cyan('  Enter your token: '));
  
  if (!manualToken) {
    console.log(chalk.red('  ✗ A token is required.'));
    return false;
  }
  
  try {
    execSync(`node dist/bin/cli.js login -t ${manualToken}`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.log(chalk.red('  ✗ Login failed.'));
    return false;
  }
}

async function askEnvironment(): Promise<string | null> {
  const choice = await question(chalk.gray('  1=production, 2=preview, 3=development, 4=all [4]: '));
  
  switch (choice) {
    case '1': return 'production';
    case '2': return 'preview';
    case '3': return 'development';
    case '4':
    case '':
    default: return null;
  }
}

async function askProjectSelection(projects: Project[]): Promise<string[]> {
  const selected = new Set<string>();
  let cursor = 0;
  
  console.log(chalk.gray(`  Use ↑↓ to navigate, Space to toggle, Enter to confirm, A to select all`));
  
  const totalLines = projects.length + 1; // projects + count line
  
  const render = (): void => {
    // Move cursor up and clear to redraw in place
    if (process.stdout.isTTY) {
      // Move up to the start of the list
      process.stdout.write(`\x1b[${totalLines}A`);
      // Clear from cursor to end of screen
      process.stdout.write('\x1b[J');
    }
    
    projects.forEach((project, index) => {
      const isSelected = selected.has(project.id);
      const isCursor = index === cursor;
      const checkbox = isSelected ? chalk.green('[✓]') : chalk.gray('[ ]');
      const arrow = isCursor ? chalk.cyan('→ ') : '  ';
      const name = isCursor ? chalk.cyan(project.name) : project.name;
      
      console.log(`  ${arrow}${checkbox} ${name}`);
    });

    console.log(chalk.gray(`  ${selected.size} project(s) selected`));
  };
  
  // Print initial list
  projects.forEach((project, index) => {
    const isSelected = selected.has(project.id);
    const isCursor = index === cursor;
    const checkbox = isSelected ? chalk.green('[✓]') : chalk.gray('[ ]');
    const arrow = isCursor ? chalk.cyan('→ ') : '  ';
    const name = isCursor ? chalk.cyan(project.name) : project.name;
    
    console.log(`  ${arrow}${checkbox} ${name}`);
  });
  
  return new Promise((resolve, reject) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const keyHandler = (str: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void => {
      if (key.name === 'c' && key.ctrl) {
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log(chalk.red('\n  ✗ Cancelled.'));
        reject(new Error('Cancelled'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        resolve(Array.from(selected));
        return;
      }

      if (key.name === 'space') {
        const project = projects[cursor];
        if (selected.has(project.id)) {
          selected.delete(project.id);
        } else {
          selected.add(project.id);
        }
        // Redraw only the changed line
        render();
      }

      if (key.name === 'up') {
        cursor = Math.max(0, cursor - 1);
        render();
      }

      if (key.name === 'down') {
        cursor = Math.min(projects.length - 1, cursor + 1);
        render();
      }

      if (key.sequence === 'a' || key.sequence === 'A') {
        if (selected.size === projects.length) {
          selected.clear();
        } else {
          projects.forEach(p => selected.add(p.id));
        }
        render();
      }
    };

    process.stdin.on('keypress', keyHandler);
  });
}

async function main(): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║         Vercel Environment Variable Checker              ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════╝'));
  console.log();

  // Step 1: Check if logged in
  printProgress();
  
  if (!isLoggedIn()) {
    printStep(1, 'Authentication');
    const success = await login();
    if (!success) {
      rl.close();
      process.exit(1);
    }
  } else {
    printStep(1, 'Authenticated');
  }

  // Step 2: Ask which environment
  printProgress();
  printStep(2, 'Select Environment');
  const target = await askEnvironment();
  const envDisplay = target || 'all';
  console.log(`  → Environment: ${envDisplay}`);

  // Step 3: Fetch and select projects
  printProgress();
  printStep(3, 'Select Projects');
  const checker = new VercelEnvChecker();
  const allProjects = await checker.getProjectsList();

  if (allProjects.length === 0) {
    console.log(chalk.red('  ✗ No projects were found.'));
    rl.close();
    process.exit(1);
  }

  console.log(`  ${allProjects.length} project(s) found`);
  
  const selectedProjectIds = await askProjectSelection(allProjects);

  if (selectedProjectIds.length === 0) {
    console.log(chalk.red('  ✗ No projects were selected.'));
    rl.close();
    process.exit(1);
  }

  const selectedProjects = allProjects.filter(p => selectedProjectIds.includes(p.id));

  // Step 4: Ask what value to search for
  printProgress();
  printStep(4, 'Environment Variables');
  const searchValue = await question(chalk.cyan('  Enter environment variable: '));

  if (!searchValue) {
    console.log(chalk.red('  ✗ A search value is required.'));
    rl.close();
    process.exit(1);
  }

  // Step 5: Search within values
  printProgress();
  printStep(5, 'Searching Environment Variables');
  
  try {
    await checker.searchByValueInProjects(searchValue, target, selectedProjects);
  } catch (e) {
    console.log(chalk.red('  ✗ Search failed.'));
  }

  console.log();
  rl.close();
}

main().catch((e: Error) => {
  console.error(chalk.red('Error:'), e.message);
  rl.close();
  process.exit(1);
});
