import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
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

interface AssistantMarkdownProps {
  content: string;
}

/**
 * Renders assistant chat messages as parsed markdown (JEF-314) rather than
 * raw text — headings/lists/code/etc. Only used for assistant-authored
 * content; user messages stay as plain text since they aren't markdown the
 * app generated.
 */
export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="text-sm wrap-break-word [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
