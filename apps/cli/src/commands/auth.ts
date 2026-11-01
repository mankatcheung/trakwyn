import { Command } from 'commander';
import chalk from 'chalk';
import { gql, AuthError, ApiError } from '../lib/api.js';
import { getApiKey, saveApiKey, clearApiKey, getApiUrl } from '../lib/config.js';
import { API_TOKEN_PREFIX } from '../constants.js';
import { maskApiKey } from '../lib/maskApiKey.js';

async function promptSecret(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf-8');
    let value = '';
    stdin.on('data', function handler(char: string) {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '') {
        process.exit();
      } else if (char === '') {
        value = value.slice(0, -1);
      } else {
        value += char;
        process.stdout.write('*');
      }
    });
  });
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Authentication commands');

  auth
    .command('set-key')
    .description('Set your Trakwyn API key (generate one at Settings → API Tokens)')
    .option('--key <key>', `API key (${API_TOKEN_PREFIX}…)`)
    .action(async (opts: { key?: string }) => {
      try {
        const apiKey = opts.key ?? (await promptSecret('API key: '));
        const trimmed = apiKey.trim();

        if (!trimmed.startsWith(API_TOKEN_PREFIX)) {
          console.error(
            chalk.red('✗') +
              ` Invalid key format — expected a key starting with ${API_TOKEN_PREFIX}`,
          );
          process.exit(1);
        }

        // Verify the key works before saving
        await gql<unknown>(`query { apiTokens { id } }`, {});

        saveApiKey(trimmed);
        const preview = maskApiKey(trimmed);
        console.log(chalk.green('✓') + ` API key saved (${chalk.bold(preview)})`);
        console.log(chalk.gray(`  API: ${getApiUrl()}`));
      } catch (err) {
        if (err instanceof AuthError) {
          console.error(chalk.red('✗') + ' Key is invalid or has been revoked');
        } else if (err instanceof ApiError) {
          console.error(chalk.red('✗') + ` ${err.message}`);
        } else {
          console.error(chalk.red('✗ Failed to verify key:'), err);
        }
        process.exit(1);
      }
    });

  auth
    .command('clear')
    .description('Remove stored API key')
    .action(() => {
      clearApiKey();
      console.log(chalk.green('✓') + ' API key cleared');
    });

  auth
    .command('whoami')
    .description('Show stored key info and verify it is still valid')
    .action(async () => {
      const apiKey = getApiKey();
      if (!apiKey) {
        console.log(chalk.gray('No API key set. Run: tw auth set-key'));
        return;
      }

      const preview = maskApiKey(apiKey);
      console.log(`Key:  ${chalk.bold(preview)}`);
      console.log(`API:  ${chalk.gray(getApiUrl())}`);

      try {
        const data = await gql<{
          apiTokens: { id: string; name: string; lastUsedAt: string | null }[];
        }>(`query { apiTokens { id name lastUsedAt } }`);
        console.log(chalk.green('✓') + ' Key is valid');
        if (data.apiTokens.length > 0) {
          console.log(chalk.gray(`  ${data.apiTokens.length} token(s) on this account`));
        }
      } catch {
        console.log(chalk.red('✗') + ' Key is invalid or has been revoked');
      }
    });
}
