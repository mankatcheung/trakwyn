/*
 * Each matcher returns the reason a value is wrong, or null when it is fine,
 * so a case lists its expectations and `failuresOf` keeps the ones that
 * failed. Text is compared case-insensitively: "Remote (Europe)" and
 * "remote, europe" are the same answer.
 */

export type Check = string | null;

const lower = (value: string | null): string => (value ?? '').toLowerCase();
const quoted = (value: string | null): string => (value === null ? 'null' : JSON.stringify(value));

export const failuresOf = (...checks: Check[]): string[] =>
  checks.filter((check): check is string => check !== null);

/** Every needle appears in the value. */
export function mentions(label: string, value: string | null, ...needles: string[]): Check {
  const missing = needles.filter((needle) => !lower(value).includes(needle.toLowerCase()));
  return missing.length === 0
    ? null
    : `${label} was ${quoted(value)}, expected it to mention ${missing.map((n) => `"${n}"`).join(', ')}`;
}

/** At least one needle appears in the value. */
export function mentionsAny(label: string, value: string | null, needles: string[]): Check {
  return needles.some((needle) => lower(value).includes(needle.toLowerCase()))
    ? null
    : `${label} was ${quoted(value)}, expected one of ${needles.map((n) => `"${n}"`).join(', ')}`;
}

/** No needle appears in the value. */
export function excludes(label: string, value: string | null, ...needles: string[]): Check {
  const found = needles.filter((needle) => lower(value).includes(needle.toLowerCase()));
  return found.length === 0
    ? null
    : `${label} was ${quoted(value)}, which must not mention ${found.map((n) => `"${n}"`).join(', ')}`;
}

export function isNull(label: string, value: string | null): Check {
  return value === null ? null : `${label} was ${quoted(value)}, expected null`;
}

/** The model may say it could not tell (null) or give a generic description, but not invent a name. */
export function nullOrMentions(label: string, value: string | null, ...needles: string[]): Check {
  return value === null ? null : mentionsAny(label, value, needles);
}

export function isPresent(label: string, value: string | null): Check {
  return value !== null && value.trim() !== ''
    ? null
    : `${label} was ${quoted(value)}, expected text`;
}

export function atMostChars(label: string, value: string | null, max: number): Check {
  return value === null || value.length <= max
    ? null
    : `${label} was ${value.length} characters, expected at most ${max}`;
}

export function scoreBetween(score: number, min: number, max: number): Check {
  return score >= min && score <= max ? null : `score was ${score}, expected ${min} to ${max}`;
}

/** At least one keyword in the list contains one of the needles. */
export function listMentionsAny(label: string, list: string[], needles: string[]): Check {
  const hit = list.some((item) =>
    needles.some((needle) => lower(item).includes(needle.toLowerCase())),
  );
  return hit
    ? null
    : `${label} was ${JSON.stringify(list)}, expected one to mention ${needles.map((n) => `"${n}"`).join(' or ')}`;
}

export function atMostItems(label: string, list: string[], max: number): Check {
  return list.length <= max ? null : `${label} had ${list.length} items, expected at most ${max}`;
}

/** A keyword the resume both has and lacks is a contradiction whatever the score. */
export function listsDisjoint(matched: string[], missing: string[]): Check {
  const matchedSet = new Set(matched.map((item) => item.trim().toLowerCase()));
  const overlap = missing.filter((item) => matchedSet.has(item.trim().toLowerCase()));
  return overlap.length === 0
    ? null
    : `${overlap.map((n) => `"${n}"`).join(', ')} listed as both matched and missing`;
}
