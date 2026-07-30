#!/usr/bin/env node

import { ensureConfig } from './config.js';
import { setupDatabase } from './setup.js';
import { startServer } from './server.js';

// Check Node.js version
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('Error: Job Finder requires Node.js 18 or later.');
  console.error(`You are running Node.js ${process.versions.node}.`);
  process.exit(1);
}

async function main(): Promise<void> {
  try {
    // Ensure configuration exists
    const config = ensureConfig();

    // Setup database
    await setupDatabase(config.databaseUrl);

    // Start server
    await startServer(config);
  } catch (error) {
    console.error('Failed to start Job Finder:', error);
    process.exit(1);
  }
}

main();
