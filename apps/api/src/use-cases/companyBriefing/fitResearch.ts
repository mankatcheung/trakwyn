import type { CompanyResearchPage } from '#src/use-cases/ports/ICompanyResearchSource.js';

/**
 * Keeps the pages in order until `maxChars` of text is used: the last page
 * that fits is cut short, and any after it are dropped. The same list is
 * numbered in the prompt and saved as the briefing's sources, so a source is
 * never listed that the model did not see.
 */
export function fitResearch(
  pages: readonly CompanyResearchPage[],
  maxChars: number,
): CompanyResearchPage[] {
  const fitted: CompanyResearchPage[] = [];
  let remaining = maxChars;

  for (const page of pages) {
    if (remaining <= 0) break;
    const text = page.text.slice(0, remaining);
    fitted.push({ ...page, text });
    remaining -= text.length;
  }

  return fitted;
}
