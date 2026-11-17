import type { InterviewRound } from '../graphql/interviewRoundQueries';

type ExportableRound = Pick<
  InterviewRound,
  'id' | 'type' | 'scheduledAt' | 'interviewerName' | 'notes'
>;

/** An iCalendar file with one hour-long event per round that has a scheduled time. */
export function generateIcs(rounds: ExportableRound[], company: string, role: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toIcsDate = (iso: string) => {
    const d = new Date(iso);
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
    );
  };
  const endDate = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
    return (
      `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
    );
  };
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

  const events = rounds
    .filter((r) => r.scheduledAt)
    .map((r) =>
      [
        'BEGIN:VEVENT',
        `UID:${r.id}@trakwyn`,
        `DTSTART:${toIcsDate(r.scheduledAt!)}`,
        `DTEND:${endDate(r.scheduledAt!)}`,
        `SUMMARY:${esc(`${r.type.charAt(0).toUpperCase() + r.type.slice(1)} interview — ${role} at ${company}`)}`,
        `DESCRIPTION:${esc([r.interviewerName && `Interviewer: ${r.interviewerName}`, r.notes].filter(Boolean).join('\n'))}`,
        'END:VEVENT',
      ].join('\r\n'),
    );

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trakwyn//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Hands the file to the browser as a download named after the company and role. */
export function downloadIcs(content: string, company: string, role: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `interview-${company.replace(/\s+/g, '-').toLowerCase()}-${role.replace(/\s+/g, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
