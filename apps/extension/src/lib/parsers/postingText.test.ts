import { afterEach, describe, expect, it } from 'vitest';
import { DESCRIPTION_MAX_CHARS, POSTING_TEXT_MAX_CHARS } from '../../constants';
import { parseGeneric } from './generic';

function setJsonLd(description: string) {
  document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Platform Engineer',
    hiringOrganization: { name: 'Acme' },
    description,
  })}</script>`;
}

describe('parsers keep the full posting (JEF-591)', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('saves a long posting whole, beside a description cut for display', () => {
    const posting = `Requirements: Kubernetes. ${'x'.repeat(6000)} End of posting.`;
    setJsonLd(`<p>${posting}</p>`);

    const result = parseGeneric();

    expect(result?.description).toHaveLength(DESCRIPTION_MAX_CHARS);
    expect(result?.postingText).toBe(posting);
  });

  it('cuts a posting the API would refuse', () => {
    setJsonLd('y'.repeat(POSTING_TEXT_MAX_CHARS + 500));

    expect(parseGeneric()?.postingText).toHaveLength(POSTING_TEXT_MAX_CHARS);
  });
});
