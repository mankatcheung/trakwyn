import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchCompanySiteResearchSource } from '#src/infrastructure/companyResearch/FetchCompanySiteResearchSource.js';
import { COMPANY_RESEARCH } from '#src/infrastructure/config/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

const SENTENCE = 'Acme builds payroll software for small businesses across Europe. ';
const PROSE = SENTENCE.repeat(8);

function page(title: string, body = PROSE): string {
  return `<html><head><title>${title}</title></head><body><main><p>${body}</p></main></body></html>`;
}

function htmlResponse(
  html: string,
  {
    status = 200,
    contentType = 'text/html; charset=utf-8',
    location,
  }: {
    status?: number;
    contentType?: string;
    location?: string;
  } = {},
): Response {
  const headers = new Headers({ 'content-type': contentType });
  if (location) headers.set('location', location);
  return new Response(status >= 300 && status < 400 ? null : html, { status, headers });
}

/** Answers by URL; anything not listed is a 404. */
function site(routes: Record<string, Response | (() => Response)>) {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const route = routes[String(input)];
    if (!route) return new Response('not found', { status: 404 });
    return typeof route === 'function' ? route() : route;
  });
}

describe('FetchCompanySiteResearchSource', () => {
  let outboundUrlPolicy: ReturnType<typeof makeOutboundUrlPolicy>;
  let source: FetchCompanySiteResearchSource;

  beforeEach(() => {
    outboundUrlPolicy = makeOutboundUrlPolicy();
    source = new FetchCompanySiteResearchSource({ outboundUrlPolicy });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const query = { company: 'Acme', jobUrl: 'https://careers.acme.com/jobs/42?utm=x' };

  it('reads the homepage and the first about page that answers', async () => {
    site({
      'https://acme.com': htmlResponse(page('Acme | Payroll')),
      'https://acme.com/about-us': htmlResponse(page('About Acme')),
      'https://acme.com/company': htmlResponse(page('Company')),
    });

    const result = await source.research(query);

    expect(result?.pages).toEqual([
      {
        url: 'https://acme.com',
        title: 'Acme | Payroll',
        text: expect.stringContaining('payroll'),
      },
      { url: 'https://acme.com/about-us', title: 'About Acme', text: expect.any(String) },
    ]);
    // Stops at the first about page: /company is never requested.
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      'https://acme.com/company',
    );
  });

  it('requests only the root and the fixed about paths, never the posting link', async () => {
    site({});

    await source.research(query);

    const requested = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(requested).toEqual([
      'https://acme.com',
      ...COMPANY_RESEARCH.ABOUT_PATHS.map((path) => `https://acme.com${path}`),
    ]);
  });

  it('checks every request against the outbound policy for company research', async () => {
    site({ 'https://acme.com': htmlResponse(page('Acme')) });

    await source.research(query);

    expect(outboundUrlPolicy.assertAllowed).toHaveBeenCalledWith(
      'https://acme.com',
      'company-research',
    );
    expect(outboundUrlPolicy.assertAllowed).toHaveBeenCalledWith(
      'https://acme.com/about',
      'company-research',
    );
  });

  it('checks each redirect hop and uses the page it lands on as the source', async () => {
    site({
      'https://acme.com': htmlResponse('', { status: 301, location: 'https://www.acme.io/' }),
      'https://www.acme.io/': htmlResponse(page('Acme')),
    });

    const result = await source.research(query);

    expect(outboundUrlPolicy.assertAllowed).toHaveBeenCalledWith(
      'https://www.acme.io/',
      'company-research',
    );
    expect(result?.pages[0].url).toBe('https://www.acme.io/');
  });

  it('refuses a redirect to a private address without requesting it', async () => {
    vi.mocked(outboundUrlPolicy.assertAllowed).mockImplementation(async (url) => {
      if (url.includes('169.254.169.254')) throw new ValidationError('URL host is not allowed');
    });
    site({
      'https://acme.com': htmlResponse('', {
        status: 302,
        location: 'http://169.254.169.254/latest/meta-data/',
      }),
    });

    const result = await source.research(query);

    expect(result).toBeNull();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      'http://169.254.169.254/latest/meta-data/',
    );
  });

  it('gives up on a redirect loop', async () => {
    // `new URL()` normalises the root to a trailing slash, so the loop is between the two spellings.
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).replace(/\/$/, '') === 'https://acme.com'
        ? htmlResponse('', { status: 302, location: 'https://acme.com/' })
        : new Response('not found', { status: 404 }),
    );

    expect(await source.research(query)).toBeNull();
    const rootRequests = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).replace(/\/$/, '') === 'https://acme.com');
    expect(rootRequests).toHaveLength(COMPANY_RESEARCH.MAX_REDIRECTS + 1);
  });

  it('skips a page that is not HTML, failed, or is only a shell', async () => {
    site({
      'https://acme.com': htmlResponse('{"a":1}', { contentType: 'application/json' }),
      'https://acme.com/about': htmlResponse(page('Err'), { status: 500 }),
      'https://acme.com/about-us': htmlResponse(page('Shell', 'Loading…')),
      'https://acme.com/company': htmlResponse(page('Company')),
    });

    const result = await source.research(query);

    expect(result?.pages.map((p) => p.url)).toEqual(['https://acme.com/company']);
  });

  it('answers null, not an error, when the site is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    expect(await source.research(query)).toBeNull();
  });

  it('does not fetch at all when the posting link is a job board or missing', async () => {
    expect(
      await source.research({ company: 'Acme', jobUrl: 'https://boards.greenhouse.io/acme/1' }),
    ).toBeNull();
    expect(await source.research({ company: 'Acme', jobUrl: null })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns text, never markup, and bounds each page', async () => {
    const long = `<script>steal()</script>${'Acme makes payroll software. '.repeat(500)}`;
    site({ 'https://acme.com': htmlResponse(page('Acme', long)) });

    const result = await source.research(query);
    const text = result!.pages[0].text;

    expect(text).not.toMatch(/[<>]/);
    expect(text).not.toContain('steal');
    expect(text.length).toBeLessThanOrEqual(COMPANY_RESEARCH.MAX_CHARS_PER_PAGE);
  });

  it('falls back to the host when a page has no title', async () => {
    site({ 'https://acme.com': htmlResponse(`<body><main>${PROSE}</main></body>`) });

    const result = await source.research(query);

    expect(result?.pages[0].title).toBe('acme.com');
  });
});
