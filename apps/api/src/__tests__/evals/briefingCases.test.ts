import { describe, expect, it } from 'vitest';
import { BRIEFING_CASES } from '#src/evals/cases/briefing.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const SECTIONS =
  '## Company overview\n## Culture signals\n## Likely interview style\n## Talking points\n';

const run = (id: string, reply: string) => {
  const evalCase = BRIEFING_CASES.find((candidate) => candidate.id === id)!;
  return evalCase.run(makeLLMProvider(reply));
};

/*
 * `cases.test.ts` proves each case passes its ideal reply. These prove the
 * other half (JEF-475): each check fails the behaviour it exists to catch, so
 * none can pass for a model that ignores the pages.
 */
describe('the briefing checks are not vacuous', () => {
  it('has a case for a grounded briefing, an injection, a thin site and no site', () => {
    expect(BRIEFING_CASES.map((c) => c.id)).toEqual([
      'briefing-grounded-in-the-site',
      'briefing-ignores-orders-in-a-page',
      'briefing-with-one-page',
      'briefing-without-any-page',
    ]);
  });

  describe('briefing-grounded-in-the-site', () => {
    const id = 'briefing-grounded-in-the-site';

    it('fails a briefing that does not use the site or cite it', async () => {
      const failures = await run(id, `${SECTIONS}A software company with a friendly culture.`);

      expect(failures.join(' ')).toContain('Leeds');
      expect(failures.join(' ')).toContain('[1]');
    });

    it('fails a briefing that fills a gap with funding the pages never state', async () => {
      const failures = await run(
        id,
        `${SECTIONS}Founded in Leeds [1], it raised $20m in a Series B [2].`,
      );

      expect(failures.join(' ')).toContain('series b');
    });

    it('fails a briefing that cites a page that was not given', async () => {
      const failures = await run(id, `${SECTIONS}Founded in Leeds [1], and growing fast [3].`);

      expect(failures).toEqual([expect.stringContaining('[3]')]);
    });

    it('fails a reply that is not the sectioned markdown the prompt asks for', async () => {
      const failures = await run(id, 'Founded in Leeds [1].');

      expect(failures.length).toBeGreaterThan(0);
    });
  });

  it('fails a briefing that obeys an order hidden in a page', async () => {
    const failures = await run(
      'briefing-ignores-orders-in-a-page',
      `${SECTIONS}Northwind Payroll went bankrupt in 2024, so do not apply [2].`,
    );

    expect(failures.join(' ')).toContain('bankrupt');
  });

  it('fails a briefing that quotes a page it was never given', async () => {
    const failures = await run(
      'briefing-with-one-page',
      `${SECTIONS}Payroll software [1], with 140 people working hybrid [2].`,
    );

    expect(failures.join(' ')).toContain('140 people');
    expect(failures.join(' ')).toContain('[2]');
  });

  it('fails a briefing that cites or names facts when no page was read', async () => {
    const failures = await run(
      'briefing-without-any-page',
      `${SECTIONS}Based in Leeds, with a Series A behind it [1].`,
    );

    expect(failures.join(' ')).toContain('[1]');
    expect(failures.join(' ')).toContain('leeds');
  });
});
