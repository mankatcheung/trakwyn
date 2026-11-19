import { describe, it, expect } from 'vitest';
import {
  clipForModel,
  compactForModel,
  formatDateForModel,
  projectApplicationDetail,
  projectApplicationSummary,
  projectChatToolResult,
} from '#src/use-cases/chat/chatToolProjection.js';
import { CHAT } from '#src/use-cases/constants.js';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';

describe('compactForModel (T7)', () => {
  it('drops null and undefined fields, recursively', () => {
    expect(
      compactForModel({
        id: 'a',
        salaryRange: null,
        nested: { keep: 1, gone: undefined, deeper: { x: null } },
      }),
    ).toEqual({ id: 'a', nested: { keep: 1, deeper: {} } });
  });

  it('shortens dates: day precision at midnight, minute precision otherwise', () => {
    expect(compactForModel({ appliedAt: new Date('2026-09-06T00:00:00.000Z') })).toEqual({
      appliedAt: '2026-09-06',
    });
    expect(compactForModel({ scheduledAt: new Date('2026-09-06T14:30:15.123Z') })).toEqual({
      scheduledAt: '2026-09-06T14:30Z',
    });
  });

  it('clips long strings at the configured bound with an ellipsis', () => {
    const long = 'x'.repeat(CHAT.TOOL_RESULT_STRING_MAX_CHARS + 500);
    const out = compactForModel({ description: long }) as { description: string };
    expect(out.description.length).toBe(CHAT.TOOL_RESULT_STRING_MAX_CHARS + 1);
    expect(out.description.endsWith('…')).toBe(true);
  });

  it('walks arrays, keeping positions (a null element becomes JSON null, not a hole)', () => {
    expect(compactForModel([{ a: null, b: 1 }, null, 'x'])).toEqual([{ b: 1 }, null, 'x']);
  });

  it('passes primitives through untouched', () => {
    expect(compactForModel(42)).toBe(42);
    expect(compactForModel(true)).toBe(true);
    expect(compactForModel('short')).toBe('short');
  });

  it('is a no-op on a typical page result apart from the nulls and dates', () => {
    const page = {
      items: [
        {
          id: 'app-1',
          company: 'Acme',
          role: 'Engineer',
          location: null,
          appliedAt: new Date('2026-01-02T00:00:00.000Z'),
          tags: [],
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    };
    expect(compactForModel(page)).toEqual({
      items: [
        { id: 'app-1', company: 'Acme', role: 'Engineer', appliedAt: '2026-01-02', tags: [] },
      ],
      hasNextPage: false,
    });
  });
});

describe('formatDateForModel', () => {
  it('formats a midnight UTC date as YYYY-MM-DD', () => {
    expect(formatDateForModel(new Date('2024-05-01T00:00:00.000Z'))).toBe('2024-05-01');
  });

  it('keeps hours and minutes for a moment in time', () => {
    expect(formatDateForModel(new Date('2024-05-01T09:05:59.999Z'))).toBe('2024-05-01T09:05Z');
  });
});

describe('clipForModel', () => {
  it('leaves short text alone and clips long text', () => {
    expect(clipForModel('hello', 10)).toBe('hello');
    expect(clipForModel('hello world', 5)).toBe('hello…');
    expect(clipForModel('hello world', 6)).toBe('hello…');
  });
});

describe('application projection (T1)', () => {
  const posting = 'Senior engineer. '.repeat(600); // ~10k chars, like a scraped job page
  const app = makeApplication({
    id: 'app-1',
    company: 'Acme',
    role: 'Engineer',
    description: posting,
    salaryRange: '£90k',
    jobUrl: 'https://acme.example/jobs/1',
    boardPosition: 7,
    reminderSentAt: new Date('2026-01-01T00:00:00.000Z'),
    tags: ['remote'],
  });

  it('gives a list row a short description preview and no workflow columns', () => {
    const row = projectApplicationSummary(app);

    expect(row.description!.length).toBe(CHAT.LIST_DESCRIPTION_MAX_CHARS + 1);
    expect(row).not.toHaveProperty('boardPosition');
    expect(row).not.toHaveProperty('reminderSentAt');
    expect(row).not.toHaveProperty('userId');
    expect(row).not.toHaveProperty('deletedAt');
    expect(row).not.toHaveProperty('salaryRange');
    expect(row).toMatchObject({ id: 'app-1', company: 'Acme', role: 'Engineer', tags: ['remote'] });
  });

  it('gives the detail view the bounded full description plus url and salary', () => {
    const detail = projectApplicationDetail(app);

    expect(detail.description!.length).toBe(CHAT.DETAIL_DESCRIPTION_MAX_CHARS + 1);
    expect(detail).toMatchObject({ jobUrl: 'https://acme.example/jobs/1', salaryRange: '£90k' });
  });

  it('projects list_applications items and get_application, and leaves other tools alone', () => {
    const page = projectChatToolResult('list_applications', {
      items: [app, app],
      hasNextPage: true,
      nextCursor: 'c',
    }) as { items: Array<{ description?: string }>; nextCursor: string };
    expect(page.nextCursor).toBe('c');
    expect(page.items).toHaveLength(2);
    expect(page.items[0].description!.length).toBe(CHAT.LIST_DESCRIPTION_MAX_CHARS + 1);

    const detail = projectChatToolResult('get_application', app) as { description?: string };
    expect(detail.description!.length).toBe(CHAT.DETAIL_DESCRIPTION_MAX_CHARS + 1);

    const notes = [{ id: 'n1', content: 'hello' }];
    expect(projectChatToolResult('list_notes', notes)).toBe(notes);
  });

  it('shrinks a 20-row page of scraped postings by an order of magnitude', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeApplication({ id: `app-${i}`, description: posting }),
    );
    const before = JSON.stringify({ items: rows, hasNextPage: false, nextCursor: null }).length;
    const after = JSON.stringify(
      compactForModel(
        projectChatToolResult('list_applications', {
          items: rows,
          hasNextPage: false,
          nextCursor: null,
        }),
      ),
    ).length;

    expect(after * 10).toBeLessThan(before);
  });
});
