import { createRequire } from 'node:module';

/**
 * The CLI's version, read from package.json so it is stated once: that is
 * the file release-please bumps (JEF-389). Read at runtime rather than
 * imported because package.json sits outside `rootDir`; the relative path is
 * the same from `src/lib` (tsx) and `dist/lib` (the built bin).
 */
const packageJson = createRequire(import.meta.url)('../../package.json') as { version: string };

export const CLI_VERSION = packageJson.version;
