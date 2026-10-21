import { PAGE_TEXT_MAX_CHARS } from '../../constants';

/** The page's own wrapper for the posting, tried in order before the whole body. */
const MAIN_AREA_SELECTORS = ['main', '[role="main"]', 'article'];

/** A wrapper shorter than this is a stub (a cookie banner's `<main>`), not the posting. */
const MIN_MAIN_TEXT_CHARS = 200;

function textOf(element: Element): string {
  // `innerText` is the rendered text; jsdom has none, so tests get `textContent`.
  const raw = (element as HTMLElement).innerText ?? element.textContent ?? '';
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * The text of the posting for the AI parser (JEF-420): the page's main area
 * when it has enough text, else the whole body, capped at `PAGE_TEXT_MAX_CHARS`.
 */
export function extractPageText(doc: Document): string {
  for (const selector of MAIN_AREA_SELECTORS) {
    const text = doc.querySelector(selector) && textOf(doc.querySelector(selector)!);
    if (text && text.length >= MIN_MAIN_TEXT_CHARS) return text.slice(0, PAGE_TEXT_MAX_CHARS);
  }
  return doc.body ? textOf(doc.body).slice(0, PAGE_TEXT_MAX_CHARS) : '';
}
