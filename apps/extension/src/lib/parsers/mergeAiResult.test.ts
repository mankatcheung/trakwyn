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
