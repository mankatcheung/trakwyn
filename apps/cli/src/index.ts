#!/usr/bin/env node
import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerAppsCommands } from './commands/apps.js';
import { CLI_VERSION } from './lib/version.js';

const program = new Command();

program.name('tw').description('Trakwyn CLI').version(CLI_VERSION);

registerAuthCommands(program);
registerAppsCommands(program);

if (process.argv.length <= 2) {
  program.help(); // exits 0
}

program.parse(process.argv);
