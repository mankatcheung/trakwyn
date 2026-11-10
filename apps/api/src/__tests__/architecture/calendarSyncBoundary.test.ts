import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Where calendar sync may and may not reach (JEF-331).
 *
 * Three rules the ticket states and nothing else would catch:
 *
 *   1. Sync costs no AI. The calendar use cases and the calendar
 *      infrastructure must not import an LLM provider, the AI credit or
 *      quota services, or the plan service. Sync is free for both plans and
 *      is plain HTTP to Google.
 *   2. The assistant never touches Google Calendar. Neither the LLM tool
 *      catalogue nor the MCP tools may mention the calendar.
 *   3. Phase 1 syncs interviews only. The application use cases (create,
 *      update, bulk update, and Trash, which is reversible and leaves Google
 *      alone) must not call the sync. Only the interview-round use cases and
 *      `PermanentlyDeleteApplicationUseCase` do.
 */

const SRC = join(process.cwd(), 'src');

function filesIn(dir: string): string[] {
  return readdirSync(join(SRC, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
}

const read = (path: string) => readFileSync(path, 'utf8');

/** Calendar sync code: its use cases (not the read-only month view) and its infrastructure. */
const calendarSyncFiles = [
  ...filesIn('use-cases/calendar').filter((f) => !f.endsWith('GetCalendarEventsUseCase.ts')),
  ...filesIn('infrastructure/calendar'),
];

const FORBIDDEN_IN_SYNC = [
  /\bILLMProvider\b/,
  /\bIUserLLMProviderFactory\b/,
  /llmUsage|LlmUsage/,
  /AiCreditService|IAiCredit/,
  /IQuota|QuotaService/,
  /IEntitlementService|assertFeature|PlanFeature/,
];

describe('calendar sync boundary (JEF-331)', () => {
  it('finds the calendar sync files it is meant to check', () => {
    expect(calendarSyncFiles.length).toBeGreaterThan(8);
  });

  it.each(calendarSyncFiles)('%s uses no AI, quota or plan service', (file) => {
    const source = read(file);
    for (const pattern of FORBIDDEN_IN_SYNC) {
      expect(source, `${file} matched ${pattern}`).not.toMatch(pattern);
    }
  });

  it('keeps the calendar out of the LLM tool catalogue and the MCP tools', () => {
    const offenders = [...filesIn('interface-adapters/llm'), ...filesIn('interface-adapters/mcp')]
      .filter((f) => /calendar(Connection|Sync)|syncCalendarEvent|ICalendarProvider/i.test(read(f)))
      .map((f) => f.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });

  it('calls the sync only from the interview-round use cases and permanent delete', () => {
    const callers = filesIn('use-cases')
      .filter((f) => !f.includes(`${join('use-cases', 'calendar')}`))
      .filter((f) => /syncCalendarEventUseCase/.test(read(f)))
      .map((f) =>
        f
          .slice(SRC.length + 1)
          .split('\\')
          .join('/'),
      )
      .sort();
    expect(callers).toEqual([
      'use-cases/interviewRounds/CreateInterviewRoundUseCase.ts',
      'use-cases/interviewRounds/DeleteInterviewRoundUseCase.ts',
      'use-cases/interviewRounds/UpdateInterviewRoundUseCase.ts',
      'use-cases/jobs/PermanentlyDeleteApplicationUseCase.ts',
    ]);
  });

  it('rate-limits both calendar OAuth routes like every other OAuth route', () => {
    const source = read(join(SRC, 'http', 'buildApp.ts'));
    for (const route of ['CALENDAR_OAUTH_START', 'CALENDAR_OAUTH_CALLBACK']) {
      const at = source.indexOf(`url: ROUTES.${route},`);
      expect(at, `${route} is not registered in buildApp.ts`).toBeGreaterThan(-1);
      const nextLine = source.slice(at).split('\n')[1];
      expect(nextLine, `${route} has no rate limiter`).toContain(
        "ipRateLimit('oauthRateLimiter', 'oauth')",
      );
    }
  });
});
