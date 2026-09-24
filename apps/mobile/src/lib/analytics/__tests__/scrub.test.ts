import { REDACTED, scrubEvent, scrubString, scrubValue } from '../scrub';

/**
 * The scrubber is the only thing standing between an exception payload and
 * the contents of a user's job search, so these tests are written as
 * "this specific data must not survive" rather than "the function returns
 * something" (JEF-349).
 */
describe('scrubString', () => {
  it('redacts an email address quoted inside an exception message', () => {
    expect(scrubString('Failed to send to ada.lovelace+work@example.co.uk')).toBe(
      'Failed to send to [redacted-email]',
    );
  });

  it('redacts a JWT, wherever in the string it appears', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-DEF_123';
    expect(scrubString(`token=${jwt} expired`)).toBe('token=[redacted-token] expired');
  });

  it('redacts a bearer token while keeping the scheme, so the shape is still readable', () => {
    expect(scrubString('authorization: Bearer abc123.def-456')).toBe(
      'authorization: Bearer [redacted-token]',
    );
  });

  it('strips a URL query string, which is where returnTo and one-time tokens ride', () => {
    expect(scrubString('GET https://api.trakwyn.com/graphql?token=secret&x=1 failed')).toBe(
      'GET https://api.trakwyn.com/graphql?[redacted] failed',
    );
  });

  it('keeps a URL without a query string intact', () => {
    expect(scrubString('https://api.trakwyn.com/graphql')).toBe('https://api.trakwyn.com/graphql');
  });

  it('clips free text, which in this app is user content', () => {
    const clipped = scrubString('a'.repeat(900));
    expect(clipped).toHaveLength(500 + '…[clipped]'.length);
    expect(clipped.endsWith('…[clipped]')).toBe(true);
  });
});

describe('scrubValue', () => {
  it('removes the values of denied keys but keeps the keys', () => {
    expect(
      scrubValue({ salary: 120000, description: 'Long job description', role: 'Engineer' }),
    ).toEqual({ salary: REDACTED, description: REDACTED, role: 'Engineer' });
  });

  it('matches denied keys regardless of case', () => {
    expect(scrubValue({ AccessToken: 'abc', SALARY: 1 })).toEqual({
      AccessToken: REDACTED,
      SALARY: REDACTED,
    });
  });

  it('removes GraphQL variables wholesale — one failure carries the whole form', () => {
    const scrubbed = scrubValue({
      operation: 'CreateApplication',
      variables: { input: { company: 'Acme', salaryRange: '120k', description: 'secret' } },
    }) as Record<string, unknown>;

    expect(scrubbed.operation).toBe('CreateApplication');
    expect(scrubbed.variables).toBe(REDACTED);
    expect(JSON.stringify(scrubbed)).not.toContain('Acme');
  });

  it('redacts patterns nested inside arrays and objects, not just at the top level', () => {
    expect(scrubValue({ steps: [{ note: 'x', url: 'https://x.test/a?b=c' }] })).toEqual({
      steps: [{ note: REDACTED, url: 'https://x.test/a?[redacted]' }],
    });
  });

  it('reduces a non-plain object to a marker rather than serialising an unknown shape', () => {
    expect(scrubValue({ when: new Date('2026-01-01') })).toEqual({ when: REDACTED });
  });

  it('bounds recursion instead of following an arbitrarily deep structure', () => {
    // Seven levels: one past MAX_DEPTH, so the innermost value is dropped
    // rather than walked.
    const deep = { a: { b: { c: { d: { e: { f: { g: 'bottom' } } } } } } };
    expect(JSON.stringify(scrubValue(deep))).not.toContain('bottom');
  });

  it('leaves numbers, booleans, null and undefined alone', () => {
    expect(scrubValue({ count: 3, ok: true, none: null, missing: undefined })).toEqual({
      count: 3,
      ok: true,
      none: null,
      missing: undefined,
    });
  });
});

describe('scrubEvent', () => {
  it('scrubs an event’s properties in place', () => {
    const event = { properties: { email: 'a@b.com', route: '/dashboard' } };
    expect(scrubEvent(event)).toBe(event);
    expect(event.properties).toEqual({ email: REDACTED, route: '/dashboard' });
  });

  it('passes a dropped event through untouched, so it stays dropped', () => {
    expect(scrubEvent(null)).toBeNull();
  });

  it('tolerates an event with no properties at all', () => {
    const event = {};
    expect(scrubEvent(event)).toBe(event);
  });

  it('keeps the SDK’s own project key, which is how PostHog routes the event to a project', () => {
    // posthog-js sets `properties.token` to the public `phc_…` project key on
    // every event (this SDK sends it as the batch's `api_key` instead, but the
    // scrubber is shared, so it must not redact it either way).
    const event = { properties: { token: 'phc_project', nested: { token: 'secret' } } };
    scrubEvent(event);
    expect(event.properties).toEqual({ token: 'phc_project', nested: { token: REDACTED } });
  });
});
