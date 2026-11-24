import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Every `<TextInput>` has to take its text colour from the theme (JEF-683).
 *
 * React Native paints typed text in the platform default, which is black, when
 * a style sets no `color`. On the light theme that is invisible; on the dark
 * theme it is black on a dark field. The AI chat composer shipped that way and
 * six more inputs had the same gap, because `placeholderTextColor` and
 * `backgroundColor` were themed and `color` was the one thing nobody saw.
 *
 * This is a source scan, like `maestroTestIds.test.ts`: for each `<TextInput`
 * it reads the `style` prop, resolves the `styles.x` entries in the same
 * file's `StyleSheet` (or in `experienceStyles.ts`, which the experience
 * sections build their styles from), and requires one of them to set
 * `color: colors.<token>`. A style it cannot resolve fails too, with a message
 * to theme it or add an exemption.
 */

const PACKAGE_ROOT = resolve(__dirname, '../../..');
const SOURCE_ROOTS = ['src', 'app'];
const SHARED_STYLE_FILES = ['src/features/settings/components/experience/experienceStyles.ts'];

/** `path:styleKey` pairs allowed to have no themed colour. Each needs a reason. */
const EXEMPT = new Set<string>([]);

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') found.push(...walk(path));
    } else if (entry.name.endsWith('.tsx')) {
      found.push(path);
    }
  }
  return found;
}

/** The text after `open` up to its matching `close`, ignoring nesting. */
function balanced(source: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/** The attributes of the `<TextInput` element that begins at `start`. */
function openingTag(source: string, start: number): string {
  let braces = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') braces += 1;
    else if (ch === '}') braces -= 1;
    else if (braces === 0 && ch === '>' && source[i - 1] !== '=') return source.slice(start, i);
  }
  return source.slice(start);
}

/** The `style={...}` expression written directly on the element, not inside a nested prop. */
function styleExpression(tag: string): string | null {
  let braces = 0;
  for (let i = 0; i < tag.length; i += 1) {
    if (tag[i] === '{') braces += 1;
    else if (tag[i] === '}') braces -= 1;
    else if (braces === 0 && tag.startsWith('style={', i)) {
      return balanced(tag, i + 'style='.length, '{', '}');
    }
  }
  return null;
}

function styleKeys(expression: string): string[] {
  return [...expression.matchAll(/\b[A-Za-z_]\w*\.([A-Za-z_]\w*)/g)].map((m) => m[1]);
}

function styleBlock(source: string, key: string): string | null {
  const match = new RegExp(`^\\s*${key}:\\s*\\{`, 'm').exec(source);
  if (!match) return null;
  // Anchored to a line start so a type annotation such as `(input: {` is not read as a style.
  return balanced(source, match.index + match[0].length - 1, '{', '}');
}

function themedColor(block: string): boolean {
  return /\bcolor:\s*colors\.\w+/.test(block);
}

function problemsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const name = relative(PACKAGE_ROOT, file);
  const shared = source.includes('createExperienceStyles')
    ? SHARED_STYLE_FILES.map((path) => readFileSync(join(PACKAGE_ROOT, path), 'utf8'))
    : [];
  const problems: string[] = [];

  for (const match of source.matchAll(/<TextInput\b/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    const expression = styleExpression(openingTag(source, match.index));
    const keys = expression ? styleKeys(expression) : [];
    const blocks = keys.flatMap((key) => {
      const block = [source, ...shared].map((text) => styleBlock(text, key)).find(Boolean);
      return block ? [{ key, block }] : [];
    });

    if (keys.some((key) => EXEMPT.has(`${name}:${key}`))) continue;
    if (blocks.some(({ block }) => themedColor(block))) continue;
    problems.push(
      blocks.length === 0
        ? `${name}:${line}: <TextInput> style could not be resolved to a StyleSheet entry. ` +
            `Set \`color: colors.text\` on it, or add "${name}:<key>" to EXEMPT with a reason.`
        : `${name}:${line}: <TextInput> style sets no \`color: colors.*\`, so typed text is black ` +
            `on the dark theme. Add \`color: colors.text\` to ${blocks.map((b) => b.key).join(' / ')}.`,
    );
  }
  return problems;
}

describe('TextInput text colour', () => {
  const files = SOURCE_ROOTS.flatMap((root) => walk(join(PACKAGE_ROOT, root)));

  it('finds TextInputs to check', () => {
    const inputs = files.filter((file) => readFileSync(file, 'utf8').includes('<TextInput'));
    expect(inputs.length).toBeGreaterThan(30);
  });

  it('sets a themed text colour on every TextInput', () => {
    expect(files.flatMap(problemsIn)).toEqual([]);
  });
});
