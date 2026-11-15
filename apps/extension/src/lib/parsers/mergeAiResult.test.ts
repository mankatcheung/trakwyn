import { describe, expect, it } from 'vitest';
import { mergeAiResult } from './mergeAiResult';
import type { JobData } from './types';

const page = { jobUrl: 'https://jobs.example.com/1', source: 'jobs.example.com' };
const builtin: JobData = {
  company: 'Acme',
  role: 'Engineer',
  location: 'Berlin',
  description: 'Built-in description',
  ...page,
};
const nothing = { company: null, role: null, location: null, description: null };

describe('mergeAiResult', () => {
  it('takes the AI value where both parsers have one, and reports it', () => {
    const { jobData, filled } = mergeAiResult(
      builtin,
      { company: 'Other', role: 'Other role', location: 'Paris', description: 'AI text' },
      page,
    );

    expect(jobData).toEqual({
      ...builtin,
      company: 'Other',
      role: 'Other role',
      location: 'Paris',
      description: 'AI text',
    });
    expect(filled).toEqual(['company', 'role', 'location', 'description']);
  });

  it('does not report a field the AI agreed with', () => {
    const { filled } = mergeAiResult(
      builtin,
      { company: ' Acme ', role: 'Engineer', location: null, description: null },
      page,
    );

    expect(filled).toEqual([]);
  });

  it('fills what the built-in parser left empty and reports it', () => {
    const { jobData, filled } = mergeAiResult(
      { ...builtin, company: '', location: undefined, description: undefined },
      { company: ' Globex ', role: null, location: 'Remote', description: 'AI text' },
      page,
    );

    expect(jobData).toMatchObject({
      company: 'Globex',
      role: 'Engineer',
      location: 'Remote',
      description: 'AI text',
    });
    expect(filled).toEqual(['company', 'location', 'description']);
  });

  it('never lets a null or blank AI field overwrite a parsed one', () => {
    const { jobData } = mergeAiResult(builtin, { ...nothing, role: '   ' }, page);

    expect(jobData).toEqual(builtin);
  });

  it('builds a clip from the AI alone, taking the url and source from the page', () => {
    const { jobData } = mergeAiResult(
      null,
      { company: 'Initech', role: 'Designer', location: null, description: null },
      page,
    );

    expect(jobData).toEqual({
      company: 'Initech',
      role: 'Designer',
      location: undefined,
      description: undefined,
      ...page,
    });
  });

  it('leaves required fields blank when neither parser found them', () => {
    const { jobData } = mergeAiResult(null, nothing, page);

    expect(jobData.company).toBe('');
    expect(jobData.role).toBe('');
  });
});

describe('mergeAiResult posting text (JEF-591)', () => {
  it('keeps the posting the built-in parser read, even when the AI rewrites the description', () => {
    const { jobData, filled } = mergeAiResult(
      { ...builtin, postingText: 'The full posting from the page element.' },
      { ...nothing, description: 'AI summary', postingText: 'Nav. The full posting. Footer.' },
      page,
    );

    expect(jobData.description).toBe('AI summary');
    expect(jobData.postingText).toBe('The full posting from the page element.');
    expect(filled).toEqual(['description']);
  });

  it('takes the text the API read when the built-in parser found none', () => {
    const { jobData } = mergeAiResult(
      null,
      { ...nothing, company: 'Acme', role: 'Engineer', postingText: '  The page text.  ' },
      page,
    );

    expect(jobData.postingText).toBe('The page text.');
  });

  it('has no posting text when neither side has one (an API from before the field)', () => {
    const { jobData } = mergeAiResult(builtin, { ...nothing, description: 'AI summary' }, page);

    expect(jobData.postingText).toBeUndefined();
  });
});
