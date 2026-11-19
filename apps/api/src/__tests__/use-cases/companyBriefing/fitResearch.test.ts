import { describe, it, expect } from 'vitest';
import { fitResearch } from '#src/use-cases/companyBriefing/fitResearch.js';

const page = (n: number, length: number) => ({
  url: `https://acme.com/${n}`,
  title: `Page ${n}`,
  text: 'x'.repeat(length),
});

describe('fitResearch', () => {
  it('keeps every page that fits whole', () => {
    expect(fitResearch([page(1, 100), page(2, 100)], 500)).toEqual([page(1, 100), page(2, 100)]);
  });

  it('cuts the page that crosses the budget and drops the ones after it', () => {
    const fitted = fitResearch([page(1, 100), page(2, 100), page(3, 100)], 150);

    expect(fitted.map((p) => p.text.length)).toEqual([100, 50]);
    expect(fitted.map((p) => p.url)).toEqual(['https://acme.com/1', 'https://acme.com/2']);
  });

  it('never exceeds the budget in total', () => {
    const total = fitResearch([page(1, 400), page(2, 400)], 600).reduce(
      (sum, p) => sum + p.text.length,
      0,
    );
    expect(total).toBe(600);
  });

  it('returns nothing for an empty budget or no pages', () => {
    expect(fitResearch([page(1, 100)], 0)).toEqual([]);
    expect(fitResearch([], 500)).toEqual([]);
  });

  it('does not change the pages it was given', () => {
    const pages = [page(1, 100)];
    fitResearch(pages, 10);
    expect(pages[0].text).toHaveLength(100);
  });
});
