import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadIcs, generateIcs } from '#/features/interviews/lib/roundCalendarExport';

const scheduled = {
  id: 'round-1',
  type: 'technical',
  scheduledAt: '2024-06-01T15:00:00.000Z',
  interviewerName: 'Alex Kim',
  notes: 'Discuss system design',
};

describe('generateIcs', () => {
  it('writes one hour-long event per scheduled round', () => {
    const ics = generateIcs([scheduled], 'Acme Corp', 'Engineer');
    const lines = ics.split('\r\n');

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(lines).toContain('UID:round-1@trakwyn');
    expect(lines).toContain('DTSTART:20240601T150000Z');
    expect(lines).toContain('DTEND:20240601T160000Z');
    expect(lines).toContain('SUMMARY:Technical interview — Engineer at Acme Corp');
    expect(lines).toContain('DESCRIPTION:Interviewer: Alex Kim\\nDiscuss system design');
  });

  it('skips rounds with no scheduled time', () => {
    const ics = generateIcs(
      [scheduled, { ...scheduled, id: 'round-2', scheduledAt: null }],
      'Acme Corp',
      'Engineer',
    );

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).not.toContain('round-2');
  });

  it('escapes commas, semicolons and backslashes in the text fields', () => {
    const ics = generateIcs([{ ...scheduled, notes: 'a,b;c\\d' }], 'Acme, Inc', 'Engineer');

    expect(ics).toContain('at Acme\\, Inc');
    expect(ics).toContain('a\\,b\\;c\\\\d');
  });

  it('leaves the description empty when there is no interviewer or note', () => {
    const ics = generateIcs(
      [{ ...scheduled, interviewerName: null, notes: null }],
      'Acme Corp',
      'Engineer',
    );

    expect(ics.split('\r\n')).toContain('DESCRIPTION:');
  });

  it('is a calendar with no events when nothing is scheduled', () => {
    const ics = generateIcs([{ ...scheduled, scheduledAt: null }], 'Acme Corp', 'Engineer');

    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });
});

describe('downloadIcs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads a file named after the company and role, then frees the object URL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:ics');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(`${this.download}|${this.href}`);
    });

    downloadIcs('BEGIN:VCALENDAR', 'Acme Corp', 'Senior Engineer');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(downloads).toEqual(['interview-acme-corp-senior-engineer.ics|blob:ics']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:ics');
  });
});
