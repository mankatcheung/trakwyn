import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `console.*` in the server is a log line that exists in one place and not
 * the other (JEF-351). Only Fastify's pino stream is teed through
 * `otelLogDestination.ts`, so a bare `console.error` reaches stdout — and so
 * Cloud Logging — while never arriving in Axiom, where the traces it belongs
 * beside are. Reconstructing an incident from two halves that do not overlap
 * is exactly the cost this avoids.
 *
 * So the rule is: log through the injected `ILogger`, or through Fastify's
 * `log` at the boundary. Anything else has to be written down here, in the
 * shape `fileSize.test.ts` and `onDeleteBehaviour.test.ts` use — the point
 * being that the next `console.error` is a decision someone makes on purpose
 * rather than one that slips in because it is what the line above did.
 *
 * Tests are out of scope: a test asserting on console output, or standing in
 * for a logger, is not a production log line.
 */

const SRC = join(process.cwd(), 'src');

/**
 * Files that keep `console.*`, with the reason. Every one of them is a place
 * where the pino logger either does not exist yet or is the thing that broke.
 */
const CONSOLE_BY_DESIGN: Record<string, string> = {
  'infrastructure/observability/tracing.ts':
    'Starts and stops the OTel SDK. The startup lines run from the --import preload, before Fastify and therefore before any pino logger exists, and they announce the very exporter that is not yet running. The flush and shutdown handlers are the opposite end of the same problem: a log line there would be handed to the log processor whose flush just failed, or to an SDK already closing. stdout is the only path that does not depend on what broke.',
  'infrastructure/observability/rootLogger.ts':
    'Holds the console fallback itself — the one place it is allowed to be written, so the singletons built before buildApp runs (the Postgres pool, the cache, the session blocklist) have somewhere to put a line thrown during that startup window rather than dropping it.',
  'infrastructure/email/ConsoleEmailService.ts':
    'The dev/CI email provider, selected by EMAIL_PROVIDER=console: printing the message and its confirmation URL to a terminal is the entire feature. It is never the provider in production (that is Brevo), so there is no Axiom gap to close, and its multi-line body is meant to be read raw rather than wrapped in a structured record.',
  'infrastructure/db/applyMigrations.ts':
    'Progress output for `pnpm db:migrate`, which CI runs as its own job and a developer runs by hand. It is a CLI process with no Fastify instance and no observability SDK; its record is the job log.',
  'migrate.ts':
    'The `pnpm db:migrate` entrypoint. Same as applyMigrations.ts — a missing DATABASE_URL has to be reported to whoever ran the command, before anything is wired up.',
  'copyFromTurso.ts':
    'The one-off Turso to Postgres copy (JEF-342), a script run by hand and deleted once Turso is retired. Both this file and its exemption go at the same time.',
};

/**
 * Whole directories, same contract. Kept separate so a new file under one of
 * them does not need its own entry — which is the right trade only where the
 * reason is a property of the directory rather than of the file.
 */
const CONSOLE_BY_DESIGN_DIRS: Record<string, string> = {
  seed: 'The demo-data seeder, run from the CLI by `pnpm db:seed` and by scripts/setup-worktree.sh. Every line is progress output for a person watching it run, in a process with no server and no telemetry; JEF-351 put it explicitly out of scope for that reason.',
};

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__') walk(full);
      } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
        out.push(full);
      }
    }
  };
  walk(SRC);
  return out;
}

const idOf = (file: string): string => relative(SRC, file).split(sep).join('/');

const CONSOLE_CALL = /console\s*\.\s*[A-Za-z]+\s*\(/;

/**
 * A call, not a mention: several comments in this codebase name
 * `console.error` while explaining why a line is *not* one. A match is
 * ignored when its line is a comment, or when `//` opens one earlier on the
 * same line.
 */
function hasConsoleCall(file: string): boolean {
  return readFileSync(file, 'utf8')
    .split('\n')
    .some((line) => {
      const match = CONSOLE_CALL.exec(line);
      if (!match) return false;
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return false;
      }
      return !line.slice(0, match.index).includes('//');
    });
}

const isExemptDir = (id: string): boolean =>
  Object.keys(CONSOLE_BY_DESIGN_DIRS).some((dir) => id.startsWith(`${dir}/`));

const usingConsole = (): string[] => sourceFiles().filter(hasConsoleCall).map(idOf);

describe('console usage', () => {
  it('logs through the logger everywhere it is not listed', () => {
    const unlisted = usingConsole().filter((id) => !(id in CONSOLE_BY_DESIGN) && !isExemptDir(id));

    expect(unlisted).toEqual([]);
  });

  /**
   * The counterpart: once a file stops using console, its exemption goes with
   * it, so the list cannot outlive the reasons in it.
   */
  it('has no stale entries', () => {
    const stillUsing = new Set(usingConsole());
    const stale = Object.keys(CONSOLE_BY_DESIGN).filter((id) => !stillUsing.has(id));

    expect(stale).toEqual([]);
  });

  it('has no stale directory entries', () => {
    const stillUsing = usingConsole();
    const stale = Object.keys(CONSOLE_BY_DESIGN_DIRS).filter(
      (dir) => !stillUsing.some((id) => id.startsWith(`${dir}/`)),
    );

    expect(stale).toEqual([]);
  });

  it('gives a real reason for every exemption', () => {
    const unexplained = [
      ...Object.entries(CONSOLE_BY_DESIGN),
      ...Object.entries(CONSOLE_BY_DESIGN_DIRS),
    ]
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([id]) => id);

    expect(unexplained).toEqual([]);
  });

  it('walked a realistic number of files', () => {
    // A wrong working directory would walk nothing and pass everything above.
    expect(sourceFiles().length).toBeGreaterThan(300);
  });

  it('recognises a console call and ignores a mention of one', () => {
    // Guards the detector itself: a regex that stopped matching would make
    // every assertion above pass for the wrong reason.
    expect(hasConsoleCall(join(SRC, 'infrastructure/email/ConsoleEmailService.ts'))).toBe(true);
    expect(hasConsoleCall(join(SRC, 'http/errors/formatError.ts'))).toBe(false);
  });
});
