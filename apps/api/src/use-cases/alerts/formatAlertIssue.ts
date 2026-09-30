import { ALERT_ISSUE } from '#src/use-cases/constants.js';
import type { NewTrackedIssue } from '#src/use-cases/ports/IIssueTracker.js';

import type { AlertNotification } from './alertNotification.js';

/**
 * Drizzle appends a failed query's bound values to the error message as a
 * `params: …` line, and a recorded span exception repeats it in the message
 * and the stack. The same line `serializeLoggedError` strips from logs
 * (JEF-348); an issue tracker is one more third-party copy, so it is stripped
 * here too, from every piece of text the alert carries.
 */
const SQL_PARAMS_LINE = /^(\s*)params:.*$/gm;

function redact(text: string): string {
  return text.replace(SQL_PARAMS_LINE, '$1params: [redacted]');
}

function truncate(text: string, max: number): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]`;
}

/** A fence longer than any backtick run inside, so a stack trace cannot close its own block. */
function fenced(content: string, language: string): string {
  const longestRun = Math.max(2, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function formatAlertIssue(alert: AlertNotification): NewTrackedIssue {
  const title = truncate(
    oneLine(redact(`[${alert.source}] ${alert.title}`)),
    ALERT_ISSUE.MAX_TITLE_CHARS,
  );

  const sections: string[] = [];
  if (alert.summary) sections.push(redact(alert.summary));

  if (alert.facts.length > 0) {
    sections.push(
      alert.facts.map(({ label, value }) => `- **${label}:** ${oneLine(redact(value))}`).join('\n'),
    );
  }

  for (const detail of alert.details) {
    const content = truncate(redact(detail.content), ALERT_ISSUE.MAX_DETAIL_CHARS);
    sections.push(`### ${detail.label}\n\n${fenced(content, detail.language)}`);
  }

  if (alert.links.length > 0) {
    sections.push(alert.links.map(({ label, url }) => `- [${label}](${url})`).join('\n'));
  }

  sections.push(`---\n${ALERT_ISSUE.FINGERPRINT_LABEL}: \`${alert.fingerprint}\``);

  return { title, description: sections.join('\n\n'), fingerprint: alert.fingerprint };
}
