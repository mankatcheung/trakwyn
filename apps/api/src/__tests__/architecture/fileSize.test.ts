import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The house guideline is 200-400 lines for a source file, 800 at the outside.
 *
 * A one-off tidy-up does not hold: files grow back, and the next 500-line
 * module arrives without anyone deciding it should be one. So the limit is a
 * test, and going over it is a decision that has to be written down here —
 * the same shape as `onDeleteBehaviour.test.ts`, where adding a foreign key
 * fails until its retention policy is stated.
 *
 * Being on this list is not a defect to be paid off. Three of the four entries
 * are single cohesive things — a dispatch table, a port implementation, a data
 * table — that are simply long, and splitting them would scatter what belongs
 * together. Add an entry when that is true; split the file when it is not.
 *
 * Tests are deliberately out of scope: a long test file is usually many cases
 * for one unit, which is what it should be.
 */

const SRC = join(process.cwd(), 'src');

/** Lines above which a source file must justify itself below. */
const MAX_LINES = 400;

/** Over the limit on purpose, with the reason. Assessed by JEF-255. */
const OVERSIZED_BY_DESIGN: Record<string, string> = {
  'http/di/types.ts':
    'The Awilix Cradle: one interface naming every registration. Splitting it into per-domain sub-cradles is possible but buys nothing today — its fan-in is 39 files, all inside http/, so it is a shotgun-surgery hub rather than a coupling one. Revisit if editing it becomes contentious, not because of its length.',
  'infrastructure/db/repositories/DrizzleApplicationRepository.ts':
    'One class implementing one port, IApplicationRepository, across 16 methods. There is no seam: a repository cannot implement half an interface. It also owns the deletedAt Trash filter that every consumer relies on by construction, which is precisely the thing that must not end up in two places.',
  'interface-adapters/mcp/McpController.ts':
    'One switch dispatching every read tool in the catalogue to its use case, plus the JSON-RPC envelope, the scope refusal and the call budget around it. The write tools are already split out (writeToolHandlers.ts); what is left is a flat case-per-tool list with no shared state, so cutting it in two would separate a tool from the switch that the parity tests check it against.',
  'interface-adapters/llm/toolCatalogue.ts':
    'A declarative data table — 34 tool definitions in JSON Schema (JEF-468 added seven write tools), the closed value sets their enums advertise, and about 50 lines deriving MCP_TOOLS, CHAT_TOOLS and the write-tool name type from it. Splitting a table across files makes it harder to read as a whole and easier to leave a tool half-defined; length here is the entry count, not complexity.',
  'infrastructure/config/constants.ts':
    "The infrastructure counterpart of use-cases/constants.ts: env names, vendor endpoints, cache internals and pool sizing, each documented with why it has its value. constantsPlacement.test.ts gives it the same one-place role for its layer. It crossed the limit when JEF-372 wrote down the reasoning behind DATABASE.POOL_MAX (Neon's pooler limit against Cloud Run's instance count), which the ticket asked to live beside the value.",
  'use-cases/constants.ts':
    'The application-policy table: one named, documented value per business decision (token lifetimes, quotas, prompt budgets, chat limits), most of the length being the doc comment that says why each number is what it is. It is one module on purpose — constantsPlacement.test.ts relies on there being exactly one place a policy value can live — so the alternative to length is shorter explanations, which is the wrong trade.',
  'http/constants.ts':
    'The HTTP layer counterpart of use-cases/constants.ts: cookies, routes, admin job names and rate-limit budgets, each with a comment saying why it has its value. constantsPlacement.test.ts gives it the one-place role for this layer, so the alternative to length is a second home for rate limits or routes. It crossed the limit when JEF-463 added the account-purge route and the two mail budgets beside their siblings.',
  'infrastructure/observability/metrics.ts':
    'Every metric the API emits: the label types, the IMetrics port implementation and the lazily created instruments, which must be created in one place because a meter obtained before startObservability() is a permanent no-op. The closed label sets (EmailTemplate and the like) are what keeps cardinality bounded, so they sit beside the instrument that uses them. It crossed the limit when JEF-463 added four mail templates.',
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

const lineCount = (file: string): number => readFileSync(file, 'utf8').split('\n').length;

const oversized = (): Array<{ id: string; lines: number }> =>
  sourceFiles()
    .map((file) => ({ id: idOf(file), lines: lineCount(file) }))
    .filter(({ lines }) => lines > MAX_LINES);

describe('file size', () => {
  it(`no source file exceeds ${MAX_LINES} lines without being listed`, () => {
    const unlisted = oversized()
      .filter(({ id }) => !(id in OVERSIZED_BY_DESIGN))
      .map(({ id, lines }) => `${id} (${lines} lines)`);

    expect(unlisted).toEqual([]);
  });

  /**
   * The counterpart, and the reason the list cannot quietly become the
   * architecture: once a file is split or shrinks below the limit, its
   * exemption goes with it.
   */
  it('has no stale entries in the oversized list', () => {
    const stillOversized = new Set(oversized().map(({ id }) => id));
    const shrunk = Object.keys(OVERSIZED_BY_DESIGN).filter((id) => !stillOversized.has(id));

    expect(shrunk).toEqual([]);
  });

  it('walked a realistic number of files', () => {
    // A wrong working directory would walk nothing and pass everything above.
    expect(sourceFiles().length).toBeGreaterThan(300);
  });

  it('gives a real reason for every exemption', () => {
    const unexplained = Object.entries(OVERSIZED_BY_DESIGN)
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([id]) => id);

    expect(unexplained).toEqual([]);
  });
});
