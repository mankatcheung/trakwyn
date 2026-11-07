import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { MarketingFooter } from './MarketingFooter';
import { useLocale } from '#/lib/i18n';
import { trackCta } from '#/lib/analytics';

export interface FeatureBenefit {
  title: string;
  description: string;
  visual: ReactNode;
}

interface FeaturePageLayoutProps {
  eyebrowIcon: LucideIcon;
  eyebrowLabel: string;
  title: string;
  description: string;
  heroVisual: ReactNode;
  /** Wider than the default 1000px hero card — the chat and document mockups read better narrower/taller. */
  heroVisualMaxWidth?: string;
  benefits: FeatureBenefit[];
  ctaHeadline: string;
}

/**
 * Shared shell for the four `/features/*` deep-dive pages (JEF-228):
 * hero with a big product mockup, then an alternating benefit-row-per-point
 * layout, then a closing CTA band. Each page supplies only its copy and its
 * own mockup visual.
 *
 * @category Layout
 */
export function FeaturePageLayout({
  eyebrowIcon: EyebrowIcon,
  eyebrowLabel,
  title,
  description,
  heroVisual,
  heroVisualMaxWidth = 'max-w-4xl',
  benefits,
  ctaHeadline,
}: FeaturePageLayoutProps) {
  const { t } = useLocale();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <MarketingHeader activeFeatures />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-20 sm:py-24">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-blue-50 to-gray-50 dark:from-gray-900 dark:to-gray-900" />
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600">
              <EyebrowIcon className="size-3.5" />
              {eyebrowLabel}
            </div>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
              {title}
            </h1>
            <p className="mt-4 text-lg/8 text-gray-600 dark:text-gray-400">{description}</p>
            <Link
              to="/register"
              onClick={() => trackCta('start_free', 'feature_hero')}
              className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {t('landing.startFree')}
            </Link>
          </div>
        </section>

        {/* Hero mockup */}
        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className={`mx-auto ${heroVisualMaxWidth}`}>{heroVisual}</div>
        </section>

        {/* Benefits */}
        {benefits.map((benefit, i) => {
          const reversed = i % 2 === 1;
          return (
            <div key={benefit.title} className={reversed ? 'bg-gray-100 dark:bg-gray-800/30' : ''}>
              <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                  <div className={reversed ? 'lg:order-2' : ''}>
                    <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
                      {benefit.title}
                    </h2>
                    <p className="mt-3 text-base/7 text-gray-600 dark:text-gray-400">
                      {benefit.description}
                    </p>
                  </div>
                  <div className={reversed ? 'lg:order-1' : ''}>{benefit.visual}</div>
                </div>
              </div>
            </div>
          );
        })}

        {/* CTA */}
        <section className="bg-blue-600 px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">{ctaHeadline}</h2>
          <Link
            to="/register"
            onClick={() => trackCta('get_started_free', 'feature_closing')}
            className="mt-7 inline-block rounded-lg bg-white px-7 py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            {t('landing.startFree')}
          </Link>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
