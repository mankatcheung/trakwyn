import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import en from '#/i18n/en.json';
import enGB from '#/i18n/en-GB.json';
import zhCN from '#/i18n/zh-CN.json';
import zhTW from '#/i18n/zh-TW.json';
import zhHK from '#/i18n/zh-HK.json';
import { SUPPORTED_LOCALES } from '#/lib/i18n';

/**
 * Every security event type must have a `security.event.*` label (JEF-251).
 *
 * `SettingsSecurityPage` renders each row as
 * `t(\`security.event.${eventType}\`, { defaultValue: eventType })`, so a
 * missing key doesn't fail — it silently shows the raw constant. That is how
 * five MCP OAuth types shipped with the user reading
 * `mcp_oauth_refresh_reuse_detected` off the screen, and the two least
 * legible rows were the two that matter most (a detected token theft that
 * revoked their access).
 *
 * The API owns the list, and the web package can't import across the package
 * boundary, so this reads that source file rather than mirroring the values
 * here: a mirrored copy would drift silently, which is the same class of
 * failure this test exists to catch.
 */
/** Vitest runs with the package root (`apps/web`) as its cwd. */
const API_SRC = resolve(process.cwd(), '../api/src');

/** Fails loudly rather than passing vacuously — a guard that can't find what it guards is worse than none. */
function readApiSource(relativePath: string): string {
  const path = resolve(API_SRC, relativePath);
  try {
    return readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`Could not read ${path} — has it moved? Update this test's path.`, { cause });
  }
}

function stringLiteralsIn(source: string, pattern: RegExp, what: string): string[] {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not find ${what} — has its shape changed?`);
  const literals = [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  if (literals.length === 0) throw new Error(`Found ${what} but no values in it.`);
  return literals;
}

/** The persisted types, from `domain/securityEvent/SecurityEvent.ts`. */
const persistedEventTypes = stringLiteralsIn(
  readApiSource('domain/securityEvent/SecurityEvent.ts'),
  /SECURITY_EVENT_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  'SECURITY_EVENT_TYPES',
);

/**
 * Plus the synthetic ones the read model adds on top (`'login'`, folded in
 * from LoginEvent) — parsed too, so a second synthetic type can't slip in
 * unlabelled either.
 */
const syntheticEventTypes = stringLiteralsIn(
  readApiSource('use-cases/securityEvents/IGetSecurityActivityUseCase.ts'),
  /SecurityActivityEventType\s*=([^;]+);/,
  'SecurityActivityEventType',
);

const eventTypes = [...syntheticEventTypes, ...persistedEventTypes];

/**
 * Every shipped locale, not just the English ones: a security event the user
 * can't read is no better in Chinese than it was in English, and a bundle
 * left out here is a bundle that quietly regrows the gap.
 */
const bundles: [string, Record<string, string>][] = [
  ['en', en],
  ['en-GB', enGB],
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
  ['zh-HK', zhHK],
];

describe('security activity event labels', () => {
  it('parsed the event types out of the API source', () => {
    // Guards the regexes above: if they silently matched nothing useful, the
    // coverage assertions below would pass over an empty list.
    expect(eventTypes).toContain('login');
    expect(eventTypes).toContain('password_changed');
    expect(eventTypes).toContain('mcp_oauth_refresh_reuse_detected');
  });

  it('checks every locale the app ships', () => {
    // Adding a locale without listing its bundle here would quietly shrink
    // this test's reach rather than failing.
    expect(bundles.map(([locale]) => locale).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(bundles)('has a label for every event type in %s', (_locale, bundle) => {
    const missing = eventTypes.filter((type) => !(`security.event.${type}` in bundle));

    expect(missing).toEqual([]);
  });

  it.each(bundles)('never uses the raw event type as its own label in %s', (_locale, bundle) => {
    // Adding `"security.event.foo": "foo"` would satisfy the check above
    // while leaving the user reading the same snake_case string.
    const unhelpful = eventTypes.filter((type) => {
      const label = bundle[`security.event.${type}`];
      return !label?.trim() || label === type;
    });

    expect(unhelpful).toEqual([]);
  });
});
