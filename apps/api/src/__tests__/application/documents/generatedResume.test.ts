import { describe, expect, it } from 'vitest';
import { pickGeneratedResumeDraft } from '#src/use-cases/documents/generatedResume.js';
import { makeDocumentDraft } from '#src/__tests__/helpers/mocks/documents.js';

const generation = {
  provider: 'workersai',
  model: 'gpt-oss-120b',
  promptVersion: 6,
  source: 'platform',
  tier: 'standard',
};

const resume = (id: string, over: Parameters<typeof makeDocumentDraft>[0] = {}) =>
  makeDocumentDraft({
    id,
    type: 'resume',
    generation,
    createdAt: new Date('2024-03-01T00:00:00Z'),
    updatedAt: new Date('2024-03-01T00:00:00Z'),
    ...over,
  });

describe('pickGeneratedResumeDraft (JEF-598)', () => {
  it('is null when the application has no resume draft', () => {
    expect(pickGeneratedResumeDraft([], null)).toBeNull();
    expect(
      pickGeneratedResumeDraft([makeDocumentDraft({ type: 'cover_letter', generation })], null),
    ).toBeNull();
  });

  it('takes the most recently updated resume draft when there is no applied date', () => {
    const older = resume('older', { updatedAt: new Date('2024-03-02T00:00:00Z') });
    const newer = resume('newer', { updatedAt: new Date('2024-03-09T00:00:00Z') });

    expect(pickGeneratedResumeDraft([older, newer], null)?.id).toBe('newer');
  });

  it('ignores a draft created after the applied date: it is not what was sent', () => {
    const sent = resume('sent', { createdAt: new Date('2024-03-01T00:00:00Z') });
    const later = resume('later', {
      createdAt: new Date('2024-04-01T00:00:00Z'),
      updatedAt: new Date('2024-04-05T00:00:00Z'),
    });

    expect(pickGeneratedResumeDraft([sent, later], new Date('2024-03-15T00:00:00Z'))?.id).toBe(
      'sent',
    );
    expect(pickGeneratedResumeDraft([later], new Date('2024-03-15T00:00:00Z'))).toBeNull();
  });

  it('counts a draft created on the applied date itself', () => {
    const draft = resume('same-day');
    expect(pickGeneratedResumeDraft([draft], new Date('2024-03-01T00:00:00Z'))?.id).toBe(
      'same-day',
    );
  });

  it('is null when the chosen draft was not written by the AI', () => {
    // The newest draft is typed by hand: an older generated one is not what went out.
    const generated = resume('generated', { updatedAt: new Date('2024-03-02T00:00:00Z') });
    const typed = resume('typed', {
      generation: null,
      updatedAt: new Date('2024-03-09T00:00:00Z'),
    });

    expect(pickGeneratedResumeDraft([generated, typed], null)).toBeNull();
  });

  it('does not change the list it is given', () => {
    const drafts = [
      resume('a', { updatedAt: new Date('2024-03-02T00:00:00Z') }),
      resume('b', { updatedAt: new Date('2024-03-09T00:00:00Z') }),
    ];
    pickGeneratedResumeDraft(drafts, null);
    expect(drafts.map((d) => d.id)).toEqual(['a', 'b']);
  });
});
