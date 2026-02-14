#!/usr/bin/env node

import { execSync } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

async function login(): Promise<boolean> {
  console.log('\n🔐 Authenticating...\n');
  
  const token = await getToken();
  
  if (token) {
    console.log('Found Vercel token. Logging in...');
    try {
      execSync(`node bin/cli.js login -t ${token}`, { stdio: 'inherit' });
      return true;
    } catch (e) {
      console.log('❌ Auto-login failed. Please enter your token manually.\n');
    }
  }
  
  console.log('You can obtain a token from: https://vercel.com/account/tokens\n');
  const manualToken = await question('Enter your Vercel token: ');
  
  if (!manualToken) {
    console.log('❌ A token is required.');
    return false;
  }
  
  try {
    execSync(`node bin/cli.js login -t ${manualToken}`, { stdio: 'inherit' });
    return true;
  } catch (e) {
    console.log('❌ Login failed.');
    return false;
  }
}

async function askEnvironment(): Promise<string | null> {
  console.log('\n🌍 Select an environment to check:\n');
  console.log('1. production — Production deployments');
  console.log('2. preview — Preview deployments');
  console.log('3. development — Development environment');
  console.log('4. all — All environments (default)\n');
  
  const choice = await question('Enter choice (1-4) [4]: ');
  
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
  console.log('\n📋 Select projects to check (Space to toggle, Enter to confirm, A to select all):\n');
  
  const selected = new Set<string>();
  let cursor = 0;
  
  const render = (): void => {
    console.clear();
    console.log('\n📋 Select Projects (Space to toggle, Enter to confirm, A to select all, Ctrl+C to cancel):\n');
    
    projects.forEach((project, index) => {
      const isSelected = selected.has(project.id);
      const isCursor = index === cursor;
      const checkbox = isSelected ? '[✓]' : '[ ]';
      const arrow = isCursor ? '→ ' : '  ';
      const name = isCursor ? '\x1b[36m' + project.name + '\x1b[0m' : project.name;
      
      console.log(`${arrow}${checkbox} ${name}`);
    });

    console.log(`\n\x1b[90m${selected.size} project(s) selected\x1b[0m`);
  };
  
  return new Promise((resolve, reject) => {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    render();

    const keyHandler = (str: string, key: { name?: string; ctrl?: boolean; sequence?: string }): void => {
      if (key.name === 'c' && key.ctrl) {
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.log('\n\n❌ Cancelled.');
        reject(new Error('Cancelled'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        process.stdin.removeListener('keypress', keyHandler);
        process.stdin.setRawMode(false);
        console.clear();
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
  console.log('\n🚀 Vercel Environment Variable Value Checker\n');
  console.log('This tool searches within environment variable values.\n');

  // Step 1: Check if logged in
  if (!isLoggedIn()) {
    const success = await login();
    if (!success) {
      rl.close();
      process.exit(1);
    }
  } else {
    console.log('✅ Already authenticated.\n');
  }

  // Step 2: Ask which environment
  const target = await askEnvironment();
  if (target) {
    console.log(`\n✅ Will check the ${target} environment.\n`);
  } else {
    console.log(`\n✅ Will check all environments.\n`);
  }

  // Step 3: Fetch and select projects
  console.log('📦 Fetching projects...\n');
  const checker = new VercelEnvChecker();
  const allProjects = await checker.getProjectsList();

  if (allProjects.length === 0) {
    console.log('❌ No projects were found.');
    rl.close();
    process.exit(1);
  }

  const selectedProjectIds = await askProjectSelection(allProjects);

  if (selectedProjectIds.length === 0) {
    console.log('❌ No projects were selected.');
    rl.close();
    process.exit(1);
  }

  const selectedProjects = allProjects.filter(p => selectedProjectIds.includes(p.id));
  console.log(`\n✅ Selected ${selectedProjects.length} project(s): ${selectedProjects.map(p => p.name).join(', ')}.\n`);

  // Step 4: Ask what value to search for
  const searchValue = await question('Enter a value to search for (e.g., postgres://, stripe.com, api.example.com): ');

  if (!searchValue) {
    console.log('❌ A search value is required.');
    rl.close();
    process.exit(1);
  }

  // Step 5: Search within values
  console.log(`\n🔍 Searching for "${searchValue}" within environment variable values...\n`);

  try {
    await checker.searchByValueInProjects(searchValue, target, selectedProjects);
    console.log('\n✅ Done!\n');
  } catch (e) {
    console.log('\n❌ Search failed.');
  }

  rl.close();
}

main().catch((e: Error) => {
  console.error('Error:', e.message);
  rl.close();
  process.exit(1);
});
