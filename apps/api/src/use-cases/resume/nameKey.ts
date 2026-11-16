const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'gmbh',
  'ag',
  'sa',
  'bv',
  'pty',
  'pte',
  'lp',
]);

/**
 * How two spellings of one name compare equal: "Acme, Inc." and "ACME", "AT&T"
 * and "AT and T", "Université de Montréal" and "Universite de Montreal", "The
 * Open University" and "Open University". A model copies a name from the
 * background but often tidies it, and refusing a resume over a comma would
 * make the check fail on honest replies; it must still tell two different
 * names apart, so only punctuation, case, accents, a leading "the" and a
 * trailing legal suffix are ignored.
 */
export function nameKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1] as string)) words.pop();
  return words.join(' ');
}
