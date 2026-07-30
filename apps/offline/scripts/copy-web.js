import { existsSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDistSource = join(__dirname, '..', '..', 'web', 'dist');
const webDistTarget = join(__dirname, '..', 'web', 'dist');

if (existsSync(webDistSource)) {
  console.log('Copying web app dist files...');
  if (!existsSync(join(__dirname, '..', 'web'))) {
    mkdirSync(join(__dirname, '..', 'web'), { recursive: true });
  }
  cpSync(webDistSource, webDistTarget, { recursive: true });
  console.log('Web app dist files copied successfully.');
} else {
  console.warn('Warning: Web app dist not found at', webDistSource);
  console.warn('Please build the web app first: pnpm --filter @job-finder/web build');
}
