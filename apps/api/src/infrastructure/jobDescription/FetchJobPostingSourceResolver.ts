import type {
  IJobPostingSourceResolver,
  JobPostingSource,
} from '#src/use-cases/ports/IJobPostingSourceResolver.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import { ServiceUnavailableError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { JOB_POSTING_FETCH } from '#src/infrastructure/config/constants.js';
import { readBounded } from '#src/infrastructure/net/readBounded.js';

interface Deps {
  outboundUrlPolicy: IOutboundUrlPolicy;
}

/**
 * Turns "paste a link" into text for `ParseJobDescriptionUseCase`.
 *
 * The URL is whatever the user typed, and the server fetches it from inside
 * its own network, so this is the second place (after the custom LLM base
 * URL) that goes through `IOutboundUrlPolicy`. Redirects are followed by
 * hand rather than by `fetch` so that every hop is checked too — a public
 * job board that 302s to an internal host is the same attack with one more
 * step. The body is read up to a fixed size and then abandoned: the parser
 * only ever sees the first few thousand characters anyway.
 */
export class FetchJobPostingSourceResolver implements IJobPostingSourceResolver {
  constructor(private readonly deps: Deps) {}

  async resolve(source: JobPostingSource): Promise<string> {
    if (source.text?.trim()) return source.text.trim();

    if (source.url?.trim()) {
      const html = await this.fetchPage(source.url.trim());
      return this.stripHtml(html);
    }

    throw new Error('Either text or url must be provided');
  }

  private async fetchPage(initialUrl: string): Promise<string> {
    let url = initialUrl;
    for (let hop = 0; hop <= JOB_POSTING_FETCH.MAX_REDIRECTS; hop++) {
      await this.deps.outboundUrlPolicy.assertAllowed(url, 'job-posting');

      const response = await fetch(url, {
        headers: {
          'User-Agent': JOB_POSTING_FETCH.USER_AGENT,
          Accept: 'text/html, text/plain;q=0.9',
        },
        signal: AbortSignal.timeout(JOB_POSTING_FETCH.TIMEOUT_MS),
        redirect: 'manual',
      });

      if (this.isRedirect(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new ServiceUnavailableError('Could not fetch the job posting');
        url = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        throw new ServiceUnavailableError(
          `Could not fetch the job posting (HTTP ${response.status})`,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!/^text\/(html|plain)\b/i.test(contentType)) {
        throw new ValidationError('The link did not return a web page');
      }

      return readBounded(response.body, JOB_POSTING_FETCH.MAX_BYTES);
    }

    throw new ServiceUnavailableError('The job posting link redirected too many times');
  }

  private isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  /**
   * A job page is mostly not the job: navigation, cookie banners, "similar
   * roles", footers. When the page marks its content with `<main>` or
   * `<article>`, only that part is kept (the largest such block, and only
   * if it holds a real amount of text — some templates ship an empty shell)
   * so the 8 000 characters the parser reads are the posting rather than the
   * chrome around it (T6).
   */
  private stripHtml(html: string): string {
    const scoped = this.contentRegion(html) ?? html;
    return this.toText(scoped);
  }

  private contentRegion(html: string): string | null {
    const blocks = [...html.matchAll(/<(main|article)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
    const best = blocks
      .map((block) => ({ block, text: this.toText(block) }))
      .filter(({ text }) => text.length >= JOB_POSTING_FETCH.MIN_CONTENT_REGION_CHARS)
      .sort((a, b) => b.text.length - a.text.length)[0];
    return best?.block ?? null;
  }

  private toText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
