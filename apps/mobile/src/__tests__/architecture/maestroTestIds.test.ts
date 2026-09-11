import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Every `id:` a Maestro flow selects has to exist as a testID in the app
 * (JEF-300).
 *
 * The flows are the one tier that only runs on a device, so a flow that
 * references an id the app no longer renders is invisible to every Jest
 * project and surfaces as a red e2e job twenty minutes after the push that
 * caused it — and usually a different push from the one that removed the id.
 * That is exactly what happened on the first device run: main's detail-screen
 * rework (#731, #776) had removed `notes-button`, `documents-button` and
 * `new-note-input` after the flows were written against them.
 *
 * This is a presence check, not a proof the flow works: an id on a `<Text>`
 * nested inside another `<Text>` exists in the source and is still unfindable
 * on Android (see .maestro/README.md). It catches the drift that a screen
 * rework causes, which is the common case.
 */

const PACKAGE_ROOT = resolve(__dirname, '../../..');
const FLOWS_DIR = join(PACKAGE_ROOT, '.maestro');
const SOURCE_ROOTS = ['src', 'app'];

/** Where a regex id stops being literal — `move-card-.*` is literal up to `.`. */
const REGEX_METACHAR = /[.*+?^${}()|[\]\\]/;

function walk(
  dir: string,
  keep: (name: string) => boolean,
  skip: (name: string) => boolean,
): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip(entry.name)) found.push(...walk(path, keep, skip));
    } else if (keep(entry.name)) {
      found.push(path);
    }
  }
  return found.sort();
}

/** `{ id, flow }` for every `id:` selector in every flow and subflow. */
function flowIdReferences(): { id: string; flow: string }[] {
  const files = walk(
    FLOWS_DIR,
    (name) => /\.ya?ml$/.test(name) && name !== 'config.yaml',
    () => false,
  );
  const refs: { id: string; flow: string }[] = [];
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^\s*id:\s*'([^']+)'/gm)) {
      refs.push({ id: match[1], flow: relative(PACKAGE_ROOT, file) });
    }
  }
  return refs;
}

/**
 * Every testID the app declares. Literal ids are collected whole; a template
 * literal (`move-card-${id}`) contributes its literal prefix, since the flows
 * can only ever match such an id by prefix or by regex.
 */
function declaredTestIds(): { literals: Set<string>; prefixes: string[] } {
  const files = walk(
    PACKAGE_ROOT,
    (name) => /\.tsx?$/.test(name),
    (name) => name === 'node_modules' || name === '__tests__' || name === '__integration__',
  ).filter((file) => SOURCE_ROOTS.some((root) => file.startsWith(join(PACKAGE_ROOT, root) + '/')));

  const literals = new Set<string>();
  const prefixes: string[] = [];
  // testID="x", testID={'x'}, testID: 'x', tabBarButtonTestID: 'x'
  const literalPattern = /(?:testID|tabBarButtonTestID|TestID)\s*[=:]\s*\{?\s*(['"])([^'"]+)\1/g;
  // testID={`prefix-${expr}`}
  const templatePattern = /(?:testID|tabBarButtonTestID|TestID)\s*[=:]\s*\{?\s*`([^`$]*)\$\{/g;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(literalPattern)) literals.add(match[2]);
    for (const match of source.matchAll(templatePattern)) if (match[1]) prefixes.push(match[1]);
  }
  return { literals, prefixes };
}

function resolves(id: string, declared: { literals: Set<string>; prefixes: string[] }): boolean {
  if (declared.literals.has(id)) return true;
  // `move-to-interviewing` against `move-to-${status}`.
  if (declared.prefixes.some((prefix) => id.startsWith(prefix))) return true;
  // `move-card-.*` — compare only the literal head against everything declared.
  const metachar = id.search(REGEX_METACHAR);
  if (metachar > 0) {
    const head = id.slice(0, metachar);
    if ([...declared.literals].some((literal) => literal.startsWith(head))) return true;
    if (declared.prefixes.some((prefix) => prefix.startsWith(head) || head.startsWith(prefix)))
      return true;
  }
  return false;
}

describe('Maestro flow test ids', () => {
  const refs = flowIdReferences();
  const declared = declaredTestIds();

  it('finds ids to check', () => {
    // Guards the guard: a flow directory or source tree that matched nothing
    // would pass the assertion below while checking nothing at all.
    expect(refs.length).toBeGreaterThan(20);
    expect(declared.literals.size).toBeGreaterThan(50);
  });

  it('references only ids the app declares', () => {
    const unresolved = refs
      .filter(({ id }) => !resolves(id, declared))
      .map(({ id, flow }) => `${id}  (${flow})`);
    expect(unresolved).toEqual([]);
  });
});
