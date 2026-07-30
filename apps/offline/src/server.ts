import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import open from 'open';
import type { Config } from './config.js';

export async function startServer(config: Config): Promise<void> {
  const apiPath = join(import.meta.dirname, '..', '..', 'api');
  const webPath = join(import.meta.dirname, '..', '..', 'web');

  console.log(`\n  Job Finder — offline mode`);
  console.log(`  Data directory: ${config.configDir}`);
  console.log(`  Starting servers...\n`);

  // Start API server
  const apiEnv = {
    ...process.env,
    DATABASE_URL: config.databaseUrl,
    OFFLINE_MODE: 'true',
    PORT: '3001',
    NODE_ENV: 'development',
    STORAGE_PROVIDER: 'local',
    CORS_ORIGIN: 'http://localhost:3000',
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
  };

  const apiDistPath = join(apiPath, 'dist', 'index.js');
  const useTsx = !existsSync(apiDistPath);

  const apiCommand = useTsx ? 'npx' : 'node';
  const apiArgs = useTsx ? ['tsx', join(apiPath, 'src', 'index.ts')] : [apiDistPath];

  const apiProcess = spawn(apiCommand, apiArgs, {
    cwd: apiPath,
    env: apiEnv,
    stdio: 'pipe',
    shell: true,
  });

  apiProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    if (output.includes('API server listening')) {
      console.log(`  API server running on http://localhost:3001`);
    }
  });

  apiProcess.stderr?.on('data', (data: Buffer) => {
    console.error('API error:', data.toString());
  });

  // Start web app dev server
  const webEnv = {
    ...process.env,
    VITE_API_URL: 'http://localhost:3001/graphql',
  };

  const webProcess = spawn('npx', ['vite', 'dev', '--port', '3000'], {
    cwd: webPath,
    env: webEnv,
    stdio: 'pipe',
    shell: true,
  });

  let browserOpened = false;

  webProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.log(output);

    // Open browser when web server is ready
    if (!browserOpened && (output.includes('Local:') || output.includes('ready'))) {
      browserOpened = true;
      setTimeout(async () => {
        console.log(`\n  Opening browser...\n`);
        await open('http://localhost:3000');
      }, 1000);
    }
  });

  webProcess.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    // Vite outputs to stderr, so we need to check it too
    if (!browserOpened && (output.includes('Local:') || output.includes('ready'))) {
      browserOpened = true;
      setTimeout(async () => {
        console.log(`\n  Opening browser...\n`);
        await open('http://localhost:3000');
      }, 1000);
    }
  });

  // Handle process events
  apiProcess.on('error', (error) => {
    console.error('Failed to start API server:', error);
    process.exit(1);
  });

  webProcess.on('error', (error) => {
    console.error('Failed to start web server:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n\n  Shutting down...\n');
    apiProcess.kill('SIGINT');
    webProcess.kill('SIGINT');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep the process alive
  await new Promise(() => {});
}
