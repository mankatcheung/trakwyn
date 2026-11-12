import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
import { linksIn, normaliseText } from '#src/use-cases/shared/groundingText.js';

/*
 * A deterministic guard for cover letters (JEF-558), the counterpart of
 * `assertGrounded` for resumes. A letter asserts facts about someone's history
 * to an employer, so a model that adds an employer, school, credential, number
 * or link has produced a document that is harmful to send. A prompt rule lowers
 * how often that happens (JEF-552); only a check in code can promise it is
 * never returned.
 *
 * It is a heuristic over names, numbers and links, not a reading of meaning.
 * Soft embellishment ("thrives in fast-paced teams") stays with the eval judge.
 */

export type GroundingKind = 'employer or school' | 'credential' | 'number' | 'link';

export interface UngroundedClaim {
  kind: GroundingKind;
  text: string;
}

export interface GroundingSources {
  /** Everything the user wrote or the application itself says: profile, resume, notes, company, role. */
  sources: string[];
  /** Whole years the profile's dates add up to (a four-year job is "four years of experience"). */
  durationsInYears: number[];
  /**
   * The job description. Never a source for what the candidate did, because a
   * planted instruction lives there; only a number that is not a claim about
   * the candidate ("a team of ten") may come from it.
   */
  posting: string;
}

const MAX_REPORTED = 3;
const MAX_REPORTED_CHARS = 40;

/* ---------- organisations ---------- */

// Two letters or more, so the pronoun "I" in "At Lumen Freight I built" is not part of a name.
const NAME_TOKEN = String.raw`[A-Z][A-Za-z0-9&'’-]+(?:\.[A-Za-z0-9]+)*`;
/** A run of capitalised words, with "of" allowed between them ("University of Toronto"). */
const NAME_RUN = String.raw`${NAME_TOKEN}(?:\s+(?:of\s+)?${NAME_TOKEN})*`;

/** Words that introduce a place the candidate worked or studied. "with" and "for" are left out: "with Kubernetes". */
const HISTORY_CUES = [
  '[Aa]t',
  '[Jj]oined',
  '[Jj]oining',
  '[Ww]orked (?:for|at)',
  '[Ww]orking (?:for|at)',
  '[Ee]mployed (?:by|at)',
  '[Pp]reviously (?:at|with|for)',
  '[Ff]ormerly (?:at|with|of)',
  '[Ii]ntern(?:ed)? (?:at|with)',
  '[Gg]raduat(?:ed|ing) from',
  '[Dd]egree from',
  '[Ss]tudied at',
  '[Aa]lumn(?:us|a|i) of',
].join('|');

const AFTER_CUE = new RegExp(`(?:${HISTORY_CUES})\\s+(${NAME_RUN})`, 'g');
/** "Stanford University", "University of Toronto", "Lakeside College": a school anywhere in the letter. */
const SCHOOL = new RegExp(
  `(?:${NAME_TOKEN}\\s+)*(?:University|College|Institute|Academy|Polytechnic)(?:\\s+of\\s+${NAME_RUN})?`,
  'g',
);
/** "Acme Corp", "Initech GmbH": a company anywhere in the letter. */
const LEGAL_FORM = new RegExp(
  `(?:${NAME_TOKEN}\\s+)+(?:Inc|LLC|Ltd|GmbH|Corp|Corporation|PLC|Pty)\\b\\.?`,
  'g',
);
const LEGAL_SUFFIX_AT_END = /\s+(?:Inc|LLC|Ltd|GmbH|Corp|Corporation|PLC|Pty|Co)\.?$/i;

function cleanName(raw: string): string {
  return raw
    .replace(/[’']s$/, '')
    .replace(/[.,;:!?)]+$/, '')
    .replace(LEGAL_SUFFIX_AT_END, '')
    .trim();
}

function organisationsIn(letter: string): string[] {
  const names = new Set<string>();
  for (const pattern of [AFTER_CUE, SCHOOL, LEGAL_FORM]) {
    for (const match of letter.matchAll(pattern)) {
      const name = cleanName(match[1] ?? match[0]);
      if (name) names.add(name);
    }
  }
  return [...names];
}

/* ---------- credentials ---------- */

/** A credential and its other spellings: a profile that says "BSc" supports a letter that says "bachelor". */
const CREDENTIAL_GROUPS: string[][] = [
  ['ph\\.?d', 'doctorate', 'doctoral'],
  ['mba'],
  ["bachelor(?:’|')?s?", 'b\\.?sc', 'b\\.?eng', 'undergraduate degree'],
  ["master(?:’|')s", 'masters degree', 'master of', 'm\\.?sc', 'm\\.?eng'],
  ['associate degree', "associate(?:’|')s degree"],
  ['diploma'],
  ['certified', 'certification', 'certificate'],
  ['pmp', 'cpa', 'cfa', 'chartered'],
  ['licensed', 'licence', 'license'],
];

const CREDENTIAL_PATTERNS = CREDENTIAL_GROUPS.map(
  (group) => new RegExp(`(?<!\\w)(?:${group.join('|')})(?!\\w)`, 'i'),
);

/* ---------- numbers ---------- */

const UNITS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  million: 1_000_000,
};
// "one" is not matched on its own ("one of the", "no one"), only inside "twenty-one".
const SMALL: Record<string, number> = { one: 1, ...UNITS };
const SPELLED = new RegExp(
  `\\b(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)|(${Object.keys(UNITS).join('|')}))\\b`,
  'g',
);
const DIGITS = /\d+(?:[.,]\d+)*/g;

const canonicalDigits = (token: string): string => token.replace(/,/g, '').replace(/^0+(?=\d)/, '');

interface NumberMention {
  /** "1,000", "1000" and "one thousand" are all "1000". */
  value: string;
  /** The text right after it, to tell "40%" and "6 years" from "a team of ten". */
  after: string;
}

function numberMentions(normalised: string): NumberMention[] {
  const mentions: NumberMention[] = [];
  const after = (match: RegExpMatchArray): string => {
    const end = (match.index ?? 0) + match[0].length;
    return normalised.slice(end, end + 16);
  };
  for (const match of normalised.matchAll(DIGITS)) {
    mentions.push({ value: canonicalDigits(match[0]), after: after(match) });
  }
  for (const match of normalised.matchAll(SPELLED)) {
    const [, tens, unit, single] = match;
    const value = single ? SMALL[single] : (SMALL[tens ?? ''] ?? 0) + (SMALL[unit ?? ''] ?? 0);
    if (value) mentions.push({ value: String(value), after: after(match) });
  }
  return mentions;
}

/** A number the posting cannot vouch for: a share, or how long the candidate has done something. */
const CLAIM_OF_THE_CANDIDATE = /^\s*(?:\+|%|percent|per cent|-?\s*(?:years?|yrs?|decades?)\b)/;

/* ---------- the check ---------- */

/** Every employer, school, credential, number and link in `letter` that the sources do not contain. */
export function findUngroundedClaims(
  letter: string,
  grounding: GroundingSources,
): UngroundedClaim[] {
  const known = normaliseText(grounding.sources.join('\n'));
  const found: UngroundedClaim[] = [];

  for (const name of organisationsIn(letter.normalize('NFKC'))) {
    if (!known.includes(normaliseText(name))) {
      found.push({ kind: 'employer or school', text: name });
    }
  }

  const normalisedLetter = normaliseText(letter);
  for (const pattern of CREDENTIAL_PATTERNS) {
    const hit = normalisedLetter.match(pattern);
    if (hit && !pattern.test(known)) found.push({ kind: 'credential', text: hit[0] });
  }

  const knownNumbers = new Set([
    ...numberMentions(known).map((mention) => mention.value),
    ...grounding.durationsInYears.map(String),
  ]);
  const postingNumbers = new Set(
    numberMentions(normaliseText(grounding.posting)).map((mention) => mention.value),
  );
  const reported = new Set<string>();
  for (const { value, after } of numberMentions(normalisedLetter)) {
    if (knownNumbers.has(value) || reported.has(value)) continue;
    if (postingNumbers.has(value) && !CLAIM_OF_THE_CANDIDATE.test(after)) continue;
    reported.add(value);
    found.push({ kind: 'number', text: value });
  }

  const knownLinks = new Set(linksIn(known));
  for (const link of linksIn(letter)) {
    if (!knownLinks.has(link)) found.push({ kind: 'link', text: link });
  }

  return found;
}

const brief = (text: string): string =>
  text.length > MAX_REPORTED_CHARS ? `${text.slice(0, MAX_REPORTED_CHARS)}…` : text;

/**
 * Refuses a letter that names something the user never gave. Refusing, not
 * deleting the sentence: removing it would hand back a plausible letter with
 * no sign anything had gone wrong.
 */
export function assertCoverLetterGrounded(letter: string, grounding: GroundingSources): void {
  const claims = findUngroundedClaims(letter, grounding);
  if (claims.length === 0) return;

  const named = claims
    .slice(0, MAX_REPORTED)
    .map((claim) => `${claim.kind} “${brief(claim.text)}”`)
    .join(', ');
  throw new AiResponseInvalidError(
    `The AI produced a letter containing details you have not recorded (${named}) — nothing was saved. Please try again.`,
  );
}
