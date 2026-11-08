import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { guideImageUrl } from '#/lib/guides';

/** Every guide screenshot is exported at this size (16:10); a test enforces it. */
export const GUIDE_IMAGE_WIDTH = 1600;
export const GUIDE_IMAGE_HEIGHT = 1000;

interface GuideMarkdownProps {
  slug: string;
  children: string;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/**
 * Renders a guide's Markdown with the typography styles.
 *
 * The `img` override below is the only place a relative `./x.webp` becomes a
 * URL. Moving the screenshots to an image host later changes this function
 * and nothing else.
 *
 * @category Marketing
 */
export function GuideMarkdown({ slug, children }: GuideMarkdownProps) {
  const components: Components = {
    img: ({ src, alt }) => {
      const resolved = typeof src === 'string' ? guideImageUrl(slug, src) : undefined;
      if (!resolved) return null;
      return (
        <img
          src={resolved}
          alt={alt ?? ''}
          width={GUIDE_IMAGE_WIDTH}
          height={GUIDE_IMAGE_HEIGHT}
          loading="lazy"
          decoding="async"
          className="h-auto w-full rounded-xl border border-gray-200 shadow-lg shadow-gray-900/5 dark:border-gray-800"
        />
      );
    },
    a: ({ href, children: label }) =>
      href && isExternal(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <a href={href}>{label}</a>
      ),
  };

  return (
    <div className="prose max-w-none prose-gray dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
