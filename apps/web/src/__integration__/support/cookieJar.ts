/**
 * The one thing a browser does for apps/web that Node's `fetch` does not: keep
 * the API's cookies and send them back. Without it every request after login is
 * anonymous, and `credentials: 'include'` (which the client sets and Node
 * ignores) proves nothing.
 *
 * Deliberately small. The API runs on one host and sets every cookie with
 * `Path=/`, so Domain and Path matching are not modelled; a cookie is stored by
 * name. A jar this simple is a test fixture, not a cookie implementation, and if
 * the API ever sets cookies on a second path this must grow (or become
 * tough-cookie).
 */

interface StoredCookie {
  value: string;
  httpOnly: boolean;
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  /** Applies one `Set-Cookie` header: store, overwrite or (on `Max-Age=0` / a past `Expires`) delete. */
  store(setCookie: string): void {
    const [pair, ...attributes] = setCookie.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator <= 0) return;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);

    const attribute = (key: string): string | undefined =>
      attributes.find((a) => a.toLowerCase().startsWith(`${key}=`))?.slice(key.length + 1);
    const maxAge = attribute('max-age');
    const expires = attribute('expires');
    const expired =
      (maxAge !== undefined && Number(maxAge) <= 0) ||
      (expires !== undefined && Date.parse(expires) <= Date.now());

    if (expired || value === '') {
      this.cookies.delete(name);
      return;
    }
    this.cookies.set(name, {
      value,
      httpOnly: attributes.some((a) => a.toLowerCase() === 'httponly'),
    });
  }

  /** What a request would carry in `Cookie`, or undefined when the jar is empty. */
  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies].map(([name, { value }]) => `${name}=${value}`).join('; ');
  }

  /** What page script can read: HttpOnly cookies are invisible to `document.cookie`. */
  documentCookie(): string {
    return [...this.cookies]
      .filter(([, { httpOnly }]) => !httpOnly)
      .map(([name, { value }]) => `${name}=${value}`)
      .join('; ');
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }

  get(name: string): string | undefined {
    return this.cookies.get(name)?.value;
  }

  set(name: string, value: string, httpOnly = true): void {
    this.cookies.set(name, { value, httpOnly });
  }

  delete(name: string): void {
    this.cookies.delete(name);
  }

  clear(): void {
    this.cookies.clear();
  }
}

/**
 * A `fetch` that sends the jar's cookies and stores what comes back, for
 * requests to `origin` only: a cookie the API issued must not leak to any other
 * host the code under test happens to call.
 */
export function cookieFetch(jar: CookieJar, origin: string, baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== origin) return baseFetch(request);

    const cookie = jar.header();
    if (cookie) request.headers.set('cookie', cookie);
    const response = await baseFetch(request);
    for (const setCookie of response.headers.getSetCookie()) jar.store(setCookie);
    return response;
  };
}
