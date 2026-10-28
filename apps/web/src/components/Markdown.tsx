import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { linkHostToShow, safeMarkdownUrl } from '#/lib/safeMarkdownUrl';

type HastNode = NonNullable<ExtraProps['node']>['children'][number];

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  // `urlTransform` has already emptied an unsafe href, so such a link is
  // rendered as its plain label. A safe one names its host when the label
  // doesn't, so misleading link text can't hide where it goes (JEF-464).
  a: ({ children, href, node }) => {
    if (!href) return <span>{children}</span>;
    const label = node ? node.children.map(textOf).join('') : '';
    const host = linkHostToShow(href, label);
    return (
      <>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:no-underline"
        >
          {children}
        </a>
        {host && <span className="text-gray-500 dark:text-gray-400"> ({host})</span>}
      </>
    );
  },
  // Never an <img>: the browser would fetch it unasked, and a prompt-injected
  // reply can put the user's data in its URL (JEF-464). Only the alt text shows.
  img: ({ alt }) =>
    alt ? <span className="text-gray-500 dark:text-gray-400">[{alt}]</span> : null,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  h1: ({ children }) => <h1 className="mb-2 text-base font-semibold last:mb-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-base font-semibold last:mb-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold last:mb-0">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-gray-300 pl-3 text-gray-600 last:mb-0 dark:border-gray-600 dark:text-gray-400">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    return isBlock ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-sm bg-black/5 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-black/5 p-2.5 font-mono text-[0.85em] last:mb-0 dark:bg-white/10">
      {children}
    </pre>
  ),
};

interface MarkdownProps {
  content: string;
}

/**
 * Renders app-generated markdown (assistant chat messages, JEF-314, and the
 * company briefing, JEF-391) as parsed markdown rather than raw text. Only
 * use it for content the app's own model produced; user-typed text stays
 * plain since it isn't markdown the app generated. Text an attacker controls
 * can reach the model, so images never load and only https, http and mailto
 * URLs survive (JEF-464).
 */
export function Markdown({ content }: MarkdownProps) {
  return (
    <div className="text-sm wrap-break-word [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeMarkdownUrl}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
