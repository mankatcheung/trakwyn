const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script\b[^>]*>/gi;
const STYLE_BLOCK = /<style\b[\s\S]*?<\/style\b[^>]*>/gi;
const TAG = /<[^<>]*>/g;
const ENTITY = /&(?:nbsp|amp|lt|gt|quot);/g;

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
};

/** Applies `pattern` until the text stops changing, so removing a match can't assemble a new one. */
function removeUntilStable(text: string, pattern: RegExp, replacement: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(pattern, replacement);
    if (next === current) return current;
    current = next;
  }
}

/**
 * Reduces a job posting's HTML to plain text for the parser and the model
 * (JEF-482). Tags and script/style bodies are removed until none remain, and
 * entities are decoded in one pass, last, so `&amp;lt;` yields the text `&lt;`
 * rather than a `<`. The result is text, never markup.
 */
export function htmlToText(html: string): string {
  const withoutBlocks = removeUntilStable(
    removeUntilStable(html, SCRIPT_BLOCK, ''),
    STYLE_BLOCK,
    '',
  );
  const withoutTags = removeUntilStable(withoutBlocks, TAG, ' ');
  return withoutTags
    .replace(ENTITY, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s{2,}/g, ' ')
    .trim();
}
