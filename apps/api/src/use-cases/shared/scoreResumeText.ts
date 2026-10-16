import type { AtsCheck, AtsScoreResult } from '#src/domain/resume/AtsScore.js';
import { ATS_SCORE } from '#src/use-cases/constants.js';

/**
 * Scores how readable a resume is to an applicant tracking system, from its
 * extracted text alone. Pure and deterministic: the same text always scores
 * the same, and nothing here needs an AI key.
 *
 * Layout the text cannot show (columns, tables, text boxes, headers and
 * footers) is not judged; that needs the file itself.
 */

const NOT_READABLE_LABEL = 'Not readable by an ATS';

const SECTION_SYNONYMS = {
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'relevant experience',
    'employment',
    'employment history',
    'work history',
    'career history',
  ],
  education: [
    'education',
    'education and training',
    'academic background',
    'academic qualifications',
    'qualifications',
  ],
  skills: [
    'skills',
    'technical skills',
    'key skills',
    'core skills',
    'core competencies',
    'competencies',
    'skills and tools',
    'technologies',
    'areas of expertise',
  ],
} as const;

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const YEAR = '(?:19|20)\\d{2}';
const DATE_PATTERNS = [
  new RegExp(`\\b${MONTH}\\.?\\s+${YEAR}\\b`, 'gi'),
  new RegExp(`\\b(?:0?[1-9]|1[0-2])[/.-]${YEAR}\\b`, 'g'),
  new RegExp(`\\b${YEAR}\\s*(?:-|–|—|to)\\s*(?:${YEAR}|present|current|now)\\b`, 'gi'),
];

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{6,}\d/g;
const YEAR_RANGE_ONLY = new RegExp(`^${YEAR}[\\s.-]+${YEAR}$`);
const BULLET_MARKERS = '-*•▪◦‣·●○■□–';
const BULLET_LINE = new RegExp(`^\\s*(?:[${BULLET_MARKERS}]|\\d{1,2}[.)])\\s+(\\S.*)$`);
const BULLET_CHARS = new RegExp(`[${BULLET_MARKERS}]`, 'g');
const UNUSUAL_CHAR = /[�\p{Co}\p{Cc}\p{So}]/gu;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasHeading(lines: readonly string[], synonyms: readonly string[]): boolean {
  return lines.some((line) => line.length <= 50 && synonyms.includes(normalizeHeading(line)));
}

function hasPhone(text: string): boolean {
  return (text.match(PHONE_CANDIDATE) ?? []).some((candidate) => {
    const digits = candidate.replace(/\D/g, '').length;
    return digits >= 8 && digits <= 15 && !YEAR_RANGE_ONLY.test(candidate.trim());
  });
}

function stripDates(text: string): string {
  return DATE_PATTERNS.reduce((rest, pattern) => rest.replace(pattern, ' '), text);
}

function countDates(text: string): number {
  return DATE_PATTERNS.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

function bulletLines(lines: readonly string[]): string[] {
  return lines.flatMap((line) => {
    const body = BULLET_LINE.exec(line)?.[1];
    return body ? [body] : [];
  });
}

function countSymbolHeavyLines(lines: readonly string[]): number {
  return lines.filter((line) => {
    const compact = line.replace(/\s/g, '');
    if (compact.length < ATS_SCORE.SYMBOL_LINE_MIN_CHARS || !/\p{L}/u.test(compact)) return false;
    const alnum = compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    return alnum / compact.length < ATS_SCORE.SYMBOL_LINE_MIN_ALNUM_RATIO;
  }).length;
}

function countUnusualChars(text: string): number {
  const visible = text.replace(/\s/g, ' ').replace(BULLET_CHARS, ' ');
  return visible.match(UNUSUAL_CHAR)?.length ?? 0;
}

function check(
  id: string,
  label: string,
  passed: boolean,
  maxPoints: number,
  hint: string,
): AtsCheck {
  return { id, label, passed, points: passed ? maxPoints : 0, maxPoints, hint };
}

function scoreLabel(score: number): string {
  if (score >= ATS_SCORE.BANDS.EXCELLENT) return 'Excellent';
  if (score >= ATS_SCORE.BANDS.GOOD) return 'Good';
  if (score >= ATS_SCORE.BANDS.FAIR) return 'Fair';
  return 'Needs work';
}

function notReadable(): AtsScoreResult {
  return {
    score: 0,
    label: NOT_READABLE_LABEL,
    readable: false,
    checks: [
      check(
        'text_extracted',
        'Text can be extracted',
        false,
        0,
        'Export the resume as a text-based PDF from Word or Google Docs, or upload a .docx. A scan or an image shows an ATS a blank page.',
      ),
    ],
  };
}

export function scoreResumeText(text: string): AtsScoreResult {
  const words = wordCount(text);
  if (words < ATS_SCORE.MIN_READABLE_WORDS) return notReadable();

  const { WEIGHTS: W } = ATS_SCORE;
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const bullets = bulletLines(lines);
  const quantified = bullets.filter((body) => /\d/.test(stripDates(body)));

  const checks: AtsCheck[] = [
    check(
      'email',
      'Email address',
      EMAIL.test(text),
      W.EMAIL,
      'Put your email address in plain text near the top, not in an image or a header.',
    ),
    check(
      'phone',
      'Phone number',
      hasPhone(text),
      W.PHONE,
      'Add a phone number near the top, with the country code if you apply abroad.',
    ),
    check(
      'experience_heading',
      'Experience heading',
      hasHeading(lines, SECTION_SYNONYMS.experience),
      W.EXPERIENCE_HEADING,
      'Add a section headed “Experience” or “Work experience” above your roles.',
    ),
    check(
      'education_heading',
      'Education heading',
      hasHeading(lines, SECTION_SYNONYMS.education),
      W.EDUCATION_HEADING,
      'Add a section headed “Education” for your degrees and training.',
    ),
    check(
      'skills_heading',
      'Skills heading',
      hasHeading(lines, SECTION_SYNONYMS.skills),
      W.SKILLS_HEADING,
      'Add a heading named “Skills” or “Technical skills” above your tools and keywords.',
    ),
    check(
      'dates',
      'Dates on each role',
      countDates(text) >= ATS_SCORE.MIN_DATES,
      W.DATES,
      'Give each role a start and end date such as “Jan 2021 – Present”, so the ATS can build your timeline.',
    ),
    check(
      'length',
      `Length of ${ATS_SCORE.WORDS.MIN} to ${ATS_SCORE.WORDS.MAX.toLocaleString('en-US')} words`,
      words >= ATS_SCORE.WORDS.MIN && words <= ATS_SCORE.WORDS.MAX,
      W.LENGTH,
      words < ATS_SCORE.WORDS.MIN
        ? `At ${words} words this is thin. Add detail about what you did and achieved.`
        : `At ${words} words this is long. Trim older or less relevant roles.`,
    ),
    check(
      'bullets',
      'Bullet-style achievements',
      bullets.length >= ATS_SCORE.MIN_BULLETS,
      W.BULLETS,
      `Describe your work in bullet points, with at least ${ATS_SCORE.MIN_BULLETS} bullets.`,
    ),
    check(
      'quantified_results',
      'Results with numbers',
      quantified.length >= ATS_SCORE.MIN_QUANTIFIED_BULLETS,
      W.QUANTIFIED_RESULTS,
      `Add at least ${ATS_SCORE.MIN_QUANTIFIED_BULLETS} bullets with a number or percentage, such as “cut onboarding time 30%”.`,
    ),
    check(
      'clean_characters',
      'No symbols a parser drops',
      countUnusualChars(text) <= ATS_SCORE.MAX_UNUSUAL_CHARS &&
        countSymbolHeavyLines(lines) <= ATS_SCORE.MAX_SYMBOL_LINES,
      W.CLEAN_CHARACTERS,
      'Replace emoji, icons and decorative symbols with plain text, and avoid lines made mostly of symbols.',
    ),
  ];

  const score = checks.reduce((total, c) => total + c.points, 0);
  return { score, label: scoreLabel(score), readable: true, checks };
}
