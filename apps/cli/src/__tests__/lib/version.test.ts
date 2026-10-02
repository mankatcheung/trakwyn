import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { CLI_VERSION } from '../../lib/version.js';

const CLI_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** Starting node with the tsx loader takes longer than vitest's default allows on a busy machine. */
const SPAWN_TIMEOUT_MS = 30_000;

const packageVersion = (
  JSON.parse(readFileSync(join(CLI_ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

describe('CLI version', () => {
  it('is the version in package.json', () => {
    expect(CLI_VERSION).toBe(packageVersion);
  });

  it(
    'is what `tw --version` prints',
    () => {
      const output = execFileSync(
        process.execPath,
        ['--import', 'tsx', 'src/index.ts', '--version'],
        { cwd: CLI_ROOT, encoding: 'utf8' },
      );

      expect(output.trim()).toBe(packageVersion);
    },
    SPAWN_TIMEOUT_MS,
  );
});
