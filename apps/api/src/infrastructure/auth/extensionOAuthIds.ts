import { EXTENSION_OAUTH } from '#src/infrastructure/config/constants.js';

/**
 * Parses `EXTENSION_OAUTH_IDS` into the set of Chrome extension IDs allowed to
 * finish an OAuth login (JEF-383). Anything that isn't a well-formed ID is
 * dropped rather than trusted, since each entry becomes a redirect host.
 */
export function parseExtensionOAuthIds(raw: string | undefined): ReadonlySet<string> {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => EXTENSION_OAUTH.ID_PATTERN.test(id));
  return new Set(ids);
}
