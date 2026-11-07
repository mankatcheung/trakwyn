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

/*
 * Tool-call checks for the chat cases (JEF-471). They compare names and the
 * arguments a case names, never the whole argument object: a model may add a
 * `limit` or a `status` filter and still be right.
 */

export interface ToolCallLike {
  name: string;
  arguments: Record<string, unknown>;
}

const callNames = (calls: ToolCallLike[]): string =>
  calls.length === 0 ? 'none' : calls.map((call) => call.name).join(', ');

/**
 * At least one call is to one of `names` and carries every argument in `args`
 * (compared as strings, so `"app-stripe"` matches however the model typed it).
 */
export function calledTool(
  calls: ToolCallLike[],
  names: string | string[],
  args: Record<string, string> = {},
): Check {
  const accepted = Array.isArray(names) ? names : [names];
  const hit = calls.some(
    (call) =>
      accepted.includes(call.name) &&
      Object.entries(args).every(([key, value]) => String(call.arguments[key] ?? '') === value),
  );
  const withArgs = Object.keys(args).length > 0 ? ` with ${JSON.stringify(args)}` : '';
  return hit
    ? null
    : `expected a call to ${accepted.join(' or ')}${withArgs}; calls were: ${callNames(calls)}`;
}

/** None of the calls is to a tool in `names`. */
export function didNotCallTool(calls: ToolCallLike[], ...names: string[]): Check {
  const made = calls.filter((call) => names.includes(call.name)).map((call) => call.name);
  return made.length === 0 ? null : `must not call ${[...new Set(made)].join(', ')}`;
}

/** The model answered without using any tool. */
export function calledNoTools(calls: ToolCallLike[]): Check {
  return calls.length === 0 ? null : `expected no tool calls; calls were: ${callNames(calls)}`;
}

/** The tools were called in this order (other calls may sit between them). */
export function callOrder(calls: ToolCallLike[], ...names: string[]): Check {
  let from = 0;
  for (const name of names) {
    const index = calls.findIndex((call, i) => i >= from && call.name === name);
    if (index === -1) return `expected ${names.join(' then ')}; calls were: ${callNames(calls)}`;
    from = index + 1;
  }
  return null;
}

/** The turn ended on an answer, not because the loop ran out of rounds. */
export function withinIterationCap(rounds: number, capped: boolean, max: number): Check {
  if (capped) return `ran out of tool rounds (${rounds} of ${max}) without answering`;
  return rounds <= max ? null : `used ${rounds} rounds, more than the ${max} allowed`;
}
