import type { Application } from '#src/domain/application/Application.js';
import { CHAT } from '#src/use-cases/constants.js';

/**
 * What a tool result looks like by the time the model reads it (T7).
 *
 * Domain entities are shaped for the database and the UI, not for a
 * context window: every nullable column is emitted as `"field":null`, every
 * timestamp as a 24-character ISO string with milliseconds, and a free-text
 * field can run to thousands of characters. Each of those is paid for on
 * every iteration of every turn. This pass drops nulls, shortens dates to
 * the precision that matters, and clips long strings — losslessly for
 * anything the model would actually reason about.
 */
export function compactForModel(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return formatDateForModel(value);
  if (Array.isArray(value)) return value.map((item) => compactForModel(item) ?? null);
  if (typeof value === 'string') return clipForModel(value, CHAT.TOOL_RESULT_STRING_MAX_CHARS);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const compacted = compactForModel(entry);
      if (compacted !== undefined) out[key] = compacted;
    }
    return out;
  }
  return value;
}

/**
 * `2026-09-06` for a date, `2026-09-06T14:30Z` for a moment. Milliseconds
 * and seconds never matter to a question about a job search, and each
 * costs the model tokens for every row that carries a timestamp.
 */
export function formatDateForModel(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : `${iso.slice(0, 16)}Z`;
}

export function clipForModel(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

/**
 * The `Application` columns the assistant can do something with (T1).
 *
 * `list_applications` returned whole rows, and a row carries the job
 * description — a scraped posting of up to 8 000 characters. Twenty rows
 * per page made a single tool call the most expensive thing in a turn by
 * an order of magnitude, for a field the model usually needs only to
 * recognise the application. Lists get a preview; `get_application` gets a
 * bounded full text. Workflow columns the model never reasons about
 * (`boardPosition`, `reminderSentAt`, `deletedAt`, `userId`, timestamps
 * other than the ones a user would ask about) are left out entirely.
 */
export function projectApplicationSummary(app: Application) {
  return {
    id: app.id,
    company: app.company,
    role: app.role,
    status: app.status,
    location: app.location,
    source: app.source,
    starred: app.starred || undefined,
    tags: app.tags.length > 0 ? app.tags : undefined,
    appliedAt: app.appliedAt,
    followUpAt: app.followUpAt,
    description: app.description
      ? clipForModel(app.description, CHAT.LIST_DESCRIPTION_MAX_CHARS)
      : undefined,
  };
}

export function projectApplicationDetail(app: Application) {
  return {
    ...projectApplicationSummary(app),
    jobUrl: app.jobUrl,
    salaryRange: app.salaryRange,
    createdAt: app.createdAt,
    description: app.description
      ? clipForModel(app.description, CHAT.DETAIL_DESCRIPTION_MAX_CHARS)
      : undefined,
  };
}

/**
 * Tool-specific shaping, applied before the generic `compactForModel`
 * pass. Tools not listed here pass through: their entities are small and
 * every column is something a user might ask about.
 */
export function projectChatToolResult(toolName: string, result: unknown): unknown {
  switch (toolName) {
    case 'list_applications': {
      const page = result as {
        items: Application[];
        hasNextPage: boolean;
        nextCursor: string | null;
      };
      return { ...page, items: page.items.map(projectApplicationSummary) };
    }
    case 'get_application':
      return projectApplicationDetail(result as Application);
    default:
      return result;
  }
}
