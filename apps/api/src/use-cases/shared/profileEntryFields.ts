import { PROFILE_ENTRY } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { isWebUrl } from '#src/use-cases/shared/profileContact.js';

/**
 * Checks for the text a user types into a profile section (JEF-592). Each
 * returns the trimmed value; a blank optional one is `null`, so it clears the
 * field on update.
 */

/** A name the entry cannot do without: trimmed, not blank, not too long. */
export function requiredText(value: string, field: string): string {
  const text = value.trim();
  if (!text) throw new ValidationError(`The ${field} cannot be empty`);
  if (text.length > PROFILE_ENTRY.SHORT_FIELD_MAX_CHARS) {
    throw new ValidationError(
      `The ${field} must be at most ${PROFILE_ENTRY.SHORT_FIELD_MAX_CHARS} characters`,
    );
  }
  return text;
}

export function optionalText(value: string | null | undefined, field: string): string | null {
  const text = value?.trim() ?? '';
  if (!text) return null;
  return requiredText(text, field);
}

/** An `http(s)` link without credentials, or null. */
export function optionalWebUrl(value: string | null | undefined, field: string): string | null {
  const url = value?.trim() ?? '';
  if (!url) return null;
  if (url.length > PROFILE_ENTRY.URL_MAX_CHARS) {
    throw new ValidationError(
      `The ${field} must be at most ${PROFILE_ENTRY.URL_MAX_CHARS} characters`,
    );
  }
  if (!isWebUrl(url)) throw new ValidationError(`The ${field} is not a valid http or https link`);
  return url;
}

/** A description: trimmed, at most `PROFILE_ENTRY.DESCRIPTION_MAX_CHARS`, or null when blank. */
export function optionalLongText(value: string | null | undefined, field: string): string | null {
  const text = value?.trim() ?? '';
  if (!text) return null;
  if (text.length > PROFILE_ENTRY.DESCRIPTION_MAX_CHARS) {
    throw new ValidationError(
      `The ${field} must be at most ${PROFILE_ENTRY.DESCRIPTION_MAX_CHARS} characters`,
    );
  }
  return text;
}
