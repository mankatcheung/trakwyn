import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { MarketingHeader } from './MarketingHeader';
import { MarketingFooter } from './MarketingFooter';
import { MarketingClosingCta } from './MarketingClosingCta';
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
 * layout, then the shared closing CTA. Each page supplies only its copy and its
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
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <MarketingHeader activeFeatures />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-16 sm:py-20">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-blue-50 to-stone-50 dark:from-stone-900 dark:to-stone-900" />
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-stone-400">
              <EyebrowIcon className="size-3.5" />
              {eyebrowLabel}
            </div>
            <h1 className="mt-3 text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
              {title}
            </h1>
            <p className="mt-4 text-lg/8 text-stone-600 dark:text-stone-400">{description}</p>
            <Link
              to="/register"
              onClick={() => trackCta('start_free', 'feature_hero')}
              className="mt-8 inline-block rounded-lg bg-blue-800 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900"
            >
              {t('landing.startFree')}
            </Link>
          </div>
        </section>

        {/* Hero mockup */}
        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className={`mx-auto ${heroVisualMaxWidth}`}>{heroVisual}</div>
        </section>

        {/* Benefits: separated by spacing and a hairline, not alternating bands (JEF-676). */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {benefits.map((benefit, i) => {
            const reversed = i % 2 === 1;
            return (
              <section
                key={benefit.title}
                className={`py-12 sm:py-16 border-t border-stone-200 dark:border-stone-800`}
              >
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                  <div className={reversed ? 'lg:order-2' : ''}>
                    <h2 className="text-2xl font-medium text-stone-900 sm:text-3xl dark:text-stone-100">
                      {benefit.title}
                    </h2>
                    <p className="mt-3 text-base/7 text-stone-600 dark:text-stone-400">
                      {benefit.description}
                    </p>
                  </div>
                  <div className={reversed ? 'lg:order-1' : ''}>{benefit.visual}</div>
                </div>
              </section>
            );
          })}
        </div>

        <MarketingClosingCta headline={ctaHeadline} location="feature_closing" />
      </main>

      <MarketingFooter />
    </div>
  );
}
