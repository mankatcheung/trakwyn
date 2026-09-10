import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FetchJobPostingSourceResolver } from '#src/infrastructure/jobDescription/FetchJobPostingSourceResolver.js';
import { JOB_POSTING_FETCH } from '#src/infrastructure/config/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { makeOutboundUrlPolicy } from '#src/__tests__/helpers/mocks/infrastructure.js';

function htmlResponse(
  html: string,
  {
    status = 200,
    contentType = 'text/html; charset=utf-8',
    location,
  }: Partial<{
    status: number;
    contentType: string;
    location: string;
  }> = {},
): Response {
  const headers = new Headers({ 'content-type': contentType });
  if (location) headers.set('location', location);
  return new Response(status >= 300 && status < 400 ? null : html, { status, headers });
}

describe('FetchJobPostingSourceResolver', () => {
  let outboundUrlPolicy: ReturnType<typeof makeOutboundUrlPolicy>;
  let resolver: FetchJobPostingSourceResolver;

  beforeEach(() => {
    outboundUrlPolicy = makeOutboundUrlPolicy();
    resolver = new FetchJobPostingSourceResolver({ outboundUrlPolicy });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns trimmed text when text is provided', async () => {
    const result = await resolver.resolve({ text: '  Senior Engineer at Acme  ' });
    expect(result).toBe('Senior Engineer at Acme');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws when neither text nor url is provided', async () => {
    await expect(resolver.resolve({})).rejects.toThrow('Either text or url must be provided');
  });

  it('throws when text is whitespace only', async () => {
    await expect(resolver.resolve({ text: '   ' })).rejects.toThrow(
      'Either text or url must be provided',
    );
  });

  it('fetches URL and strips HTML tags', async () => {
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse(
        '<html><body><p>Senior Engineer at Acme</p><script>alert("x")</script></body></html>',
      ),
    );

    const result = await resolver.resolve({ url: 'https://example.com/job' });

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/job',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': JOB_POSTING_FETCH.USER_AGENT }),
        signal: expect.any(AbortSignal),
        redirect: 'manual',
      }),
    );
    expect(result).toBe('Senior Engineer at Acme');
  });

  it('asks the outbound policy before fetching and does not fetch what it refuses', async () => {
    vi.mocked(outboundUrlPolicy.assertAllowed).mockRejectedValue(
      new ValidationError('URL host is not allowed'),
    );

    await expect(
      resolver.resolve({ url: 'http://169.254.169.254/latest/meta-data/' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(outboundUrlPolicy.assertAllowed).toHaveBeenCalledWith(
      'http://169.254.169.254/latest/meta-data/',
      'job-posting',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('follows a redirect by hand, re-checking each hop against the policy', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(htmlResponse('', { status: 302, location: '/careers/123' }))
      .mockResolvedValueOnce(htmlResponse('<p>Staff Engineer</p>'));

    const result = await resolver.resolve({ url: 'https://example.com/job' });

    expect(result).toBe('Staff Engineer');
    expect(outboundUrlPolicy.assertAllowed).toHaveBeenNthCalledWith(
      1,
      'https://example.com/job',
      'job-posting',
    );
    expect(outboundUrlPolicy.assertAllowed).toHaveBeenNthCalledWith(
      2,
      'https://example.com/careers/123',
      'job-posting',
    );
  });

  it('refuses a redirect to a destination the policy rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      htmlResponse('', { status: 301, location: 'http://10.0.0.5/secret' }),
    );
    vi.mocked(outboundUrlPolicy.assertAllowed)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ValidationError('URL host is not allowed'));

    await expect(resolver.resolve({ url: 'https://example.com/job' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives up after too many redirects', async () => {
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse('', { status: 302, location: 'https://example.com/again' }),
    );

    await expect(resolver.resolve({ url: 'https://example.com/job' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    expect(fetch).toHaveBeenCalledTimes(JOB_POSTING_FETCH.MAX_REDIRECTS + 1);
  });

  it('throws a coded error when URL fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue(htmlResponse('', { status: 404 }));

    await expect(resolver.resolve({ url: 'https://example.com/missing' })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: expect.stringContaining('404'),
    });
  });

  it('rejects a response that is not a web page', async () => {
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse('%PDF-1.4', { contentType: 'application/pdf' }),
    );

    await expect(
      resolver.resolve({ url: 'https://example.com/posting.pdf' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('reads at most MAX_BYTES of the body', async () => {
    const huge = `<p>${'a'.repeat(JOB_POSTING_FETCH.MAX_BYTES * 2)}</p>`;
    vi.mocked(fetch).mockResolvedValue(htmlResponse(huge));

    const result = await resolver.resolve({ url: 'https://example.com/huge' });

    expect(result.length).toBeLessThanOrEqual(JOB_POSTING_FETCH.MAX_BYTES);
  });

  it('keeps only the <main>/<article> region when the page marks one (T6)', async () => {
    const posting = 'We are hiring a Staff Engineer to lead the platform team. '.repeat(8);
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse(
        `<html><body><nav>Home Jobs Login</nav><main><h1>Staff Engineer</h1><p>${posting}</p></main><footer>Cookie policy · Similar roles</footer></body></html>`,
      ),
    );

    const result = await resolver.resolve({ url: 'https://example.com/job' });

    expect(result).toContain('Staff Engineer');
    expect(result).not.toContain('Cookie policy');
    expect(result).not.toContain('Home Jobs Login');
  });

  it('falls back to the whole page when the content region is only a template shell', async () => {
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse(
        '<html><body><main></main><div id="app"><p>Senior Engineer at Acme</p></div></body></html>',
      ),
    );

    const result = await resolver.resolve({ url: 'https://example.com/job' });

    expect(result).toBe('Senior Engineer at Acme');
  });

  it('decodes common HTML entities', async () => {
    vi.mocked(fetch).mockResolvedValue(
      htmlResponse('<p>Acme &amp; Co &lt;engineer&gt; &quot;remote&quot;</p>'),
    );

    const result = await resolver.resolve({ url: 'https://example.com/job' });
    expect(result).toBe('Acme & Co <engineer> "remote"');
  });
});
