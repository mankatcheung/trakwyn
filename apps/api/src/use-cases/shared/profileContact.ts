import { PROFILE_CONTACT } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';

/** Trimmed; an empty result is null. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** True for an `http(s)` URL with a host and no credentials. */
function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

/** A phone number the user typed: null when blank, a `ValidationError` when too long or not phone-like. */
export function validatePhone(value: string | null | undefined): string | null {
  const phone = clean(value);
  if (phone === null) return null;
  if (phone.length > PROFILE_CONTACT.PHONE_MAX_CHARS) {
    throw new ValidationError(
      `Phone number must be at most ${PROFILE_CONTACT.PHONE_MAX_CHARS} characters`,
    );
  }
  if (!PROFILE_CONTACT.PHONE_PATTERN.test(phone)) {
    throw new ValidationError('Phone number may only contain digits, spaces and + ( ) . - /');
  }
  return phone;
}

export function validateLocation(value: string | null | undefined): string | null {
  const location = clean(value);
  if (location !== null && location.length > PROFILE_CONTACT.LOCATION_MAX_CHARS) {
    throw new ValidationError(
      `Location must be at most ${PROFILE_CONTACT.LOCATION_MAX_CHARS} characters`,
    );
  }
  return location;
}

/** The links the user typed, trimmed and without blanks or repeats; an empty list is null (cleared). */
export function validateProfileLinks(
  values: readonly string[] | null | undefined,
): string[] | null {
  const links = [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
  if (links.length > PROFILE_CONTACT.MAX_LINKS) {
    throw new ValidationError(`Add at most ${PROFILE_CONTACT.MAX_LINKS} profile links`);
  }
  for (const link of links) {
    if (link.length > PROFILE_CONTACT.LINK_MAX_CHARS) {
      throw new ValidationError(
        `Each link must be at most ${PROFILE_CONTACT.LINK_MAX_CHARS} characters`,
      );
    }
    if (!isWebUrl(link)) throw new ValidationError(`"${link}" is not a valid http or https link`);
  }
  return links.length > 0 ? links : null;
}

/**
 * Lenient forms for text a model read off a CV: whatever is not usable is
 * dropped rather than refused, since the user never typed it.
 */
export function readPhone(value: string | null | undefined): string | null {
  try {
    return validatePhone(value);
  } catch {
    return null;
  }
}

export function readLocation(value: string | null | undefined): string | null {
  const location = clean(value);
  return location !== null && location.length <= PROFILE_CONTACT.LOCATION_MAX_CHARS
    ? location
    : null;
}

export function readProfileLinks(values: readonly string[] | null | undefined): string[] {
  const usable = [...new Set((values ?? []).map((v) => v.trim()))].filter(
    (v) => v.length > 0 && v.length <= PROFILE_CONTACT.LINK_MAX_CHARS && isWebUrl(v),
  );
  return usable.slice(0, PROFILE_CONTACT.MAX_LINKS);
}
