import { ChevronDown } from 'lucide-react';
import { useLocale } from '#/lib/i18n';

export interface FaqItem {
  /** Stable id for the React key and the test hooks; never shown. */
  id: string;
  questionKey: string;
  answerKey: string;
  /** Interpolation values for the question and the answer (e.g. a limit read from a `pricing.*` key). */
  values?: Record<string, string | number>;
}

interface FaqSectionProps {
  items: readonly FaqItem[];
  /** Also emit the `FAQPage` JSON-LD script for these questions (JEF-519). */
  structuredData?: boolean;
}

/**
 * JSON for a `<script type="application/ld+json">` tag. `<` is escaped so an
 * answer containing `</script>` cannot end the tag early.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Frequently asked questions as a native `<details>` accordion, so it opens
 * with Enter or Space, needs no script and keeps working before hydration.
 * The `FAQPage` markup is built from the same translated strings that are on
 * screen, which Google requires of FAQ rich results.
 *
 * @category Marketing
 */
export function FaqSection({ items, structuredData = false }: FaqSectionProps) {
  const { t } = useLocale();

  const entries = items.map(({ id, questionKey, answerKey, values }) => ({
    id,
    question: t(questionKey, values),
    answer: t(answerKey, values),
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      {structuredData && (
        <script
          type="application/ld+json"
          data-testid="faq-json-ld"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <h2
        id="faq-heading"
        className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100"
      >
        {t('faq.title')}
      </h2>
      <div className="mt-6 divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {entries.map(({ id, question, answer }) => (
          <details key={id} data-testid={`faq-${id}`} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-left text-base font-medium text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDown
                aria-hidden="true"
                className="size-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="mt-3 text-sm/6 text-gray-600 dark:text-gray-400">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
