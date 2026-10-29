/**
 * A version string from a header any caller can set, kept only if it looks
 * like one of ours: `1.3.1`, or `1.3.1-beta.2`. Anything else is dropped.
 *
 * It ends up as a log field and a metric attribute, so an unbounded value
 * would let one caller mint a new time series per request.
 */
const PLAUSIBLE_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9A-Za-z.]{1,16})?$/;

export function plausibleVersion(version: string | undefined): string | undefined {
  return version !== undefined && PLAUSIBLE_VERSION.test(version) ? version : undefined;
}

const CLIPPER_HEADER = /^TrakwynClipper\/(\S{1,32})$/;

/**
 * The version in the Clipper's `X-Trakwyn-Client: TrakwynClipper/<version>`
 * header (JEF-473), or undefined for a header that is missing, from another
 * client, or carries a version that does not look like one. `fetch` cannot
 * set `User-Agent`, which is why the Clipper has a header of its own.
 */
export function parseTrakwynClipperHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  return plausibleVersion(value.match(CLIPPER_HEADER)?.[1]);
}
