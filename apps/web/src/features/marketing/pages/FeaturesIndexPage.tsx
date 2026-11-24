import { Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  ArrowRight,
  MessageSquareText,
  FileText,
  BarChart3,
  CalendarDays,
  Users,
  Bell,
  Shield,
  KeyRound,
  Puzzle,
  Globe,
  Check,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { CLIPPER_WEB_STORE_URL } from '#/constants';
import { MarketingHeader } from '#/features/marketing/components/MarketingHeader';
import { MarketingFooter } from '#/features/marketing/components/MarketingFooter';
import { MarketingClosingCta } from '#/features/marketing/components/MarketingClosingCta';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';
import type { ScreenshotName } from '#/features/marketing/lib/screenshots';
import { useLocale } from '#/lib/i18n';

interface DeepDive {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  bulletKeys: string[];
  to:
    | '/features/tracking'
    | '/features/ai-assistant'
    | '/features/resume-cover-letter'
    | '/features/analytics';
  linkLabelKey: string;
  thumbnail: ScreenshotName;
}

const DEEP_DIVES: DeepDive[] = [
  {
    icon: LayoutDashboard,
    titleKey: 'features.index.tracking.title',
    descriptionKey: 'features.index.tracking.description',
    bulletKeys: [
      'features.index.tracking.bullet1',
      'features.index.tracking.bullet2',
      'features.index.tracking.bullet3',
    ],
    to: '/features/tracking',
    linkLabelKey: 'features.index.tracking.linkLabel',
    thumbnail: 'board',
  },
  {
    icon: MessageSquareText,
    titleKey: 'features.index.aiAssistant.title',
    descriptionKey: 'features.index.aiAssistant.description',
    bulletKeys: [
      'features.index.aiAssistant.bullet1',
      'features.index.aiAssistant.bullet2',
      'features.index.aiAssistant.bullet3',
    ],
    to: '/features/ai-assistant',
    linkLabelKey: 'features.index.aiAssistant.linkLabel',
    thumbnail: 'crop-assistant-reply',
  },
  {
    icon: FileText,
    titleKey: 'features.index.resumeCoverLetter.title',
    descriptionKey: 'features.index.resumeCoverLetter.description',
    bulletKeys: [
      'features.index.resumeCoverLetter.bullet1',
      'features.index.resumeCoverLetter.bullet2',
      'features.index.resumeCoverLetter.bullet3',
    ],
    to: '/features/resume-cover-letter',
    linkLabelKey: 'features.index.resumeCoverLetter.linkLabel',
    thumbnail: 'crop-resume-editor',
  },
  {
    icon: BarChart3,
    titleKey: 'features.index.analytics.title',
    descriptionKey: 'features.index.analytics.description',
    bulletKeys: [
      'features.index.analytics.bullet1',
      'features.index.analytics.bullet2',
      'features.index.analytics.bullet3',
    ],
    to: '/features/analytics',
    linkLabelKey: 'features.index.analytics.linkLabel',
    thumbnail: 'crop-stage-funnel',
  },
];

interface EverythingElseItem {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  /** Set when the entry is an install link rather than a plain description (JEF-424). */
  external?: { href: string; linkLabelKey: string };
}

const EVERYTHING_ELSE: EverythingElseItem[] = [
  {
    icon: CalendarDays,
    titleKey: 'features.index.else.calendar.title',
    descriptionKey: 'features.index.else.calendar.description',
  },
  {
    icon: Users,
    titleKey: 'features.index.else.contacts.title',
    descriptionKey: 'features.index.else.contacts.description',
  },
  {
    icon: FileText,
    titleKey: 'features.index.else.documents.title',
    descriptionKey: 'features.index.else.documents.description',
  },
  {
    icon: Bell,
    titleKey: 'features.index.else.notifications.title',
    descriptionKey: 'features.index.else.notifications.description',
  },
  {
    icon: Shield,
    titleKey: 'features.index.else.security.title',
    descriptionKey: 'features.index.else.security.description',
  },
  {
    icon: KeyRound,
    titleKey: 'features.index.else.byok.title',
    descriptionKey: 'features.index.else.byok.description',
  },
  {
    icon: Puzzle,
    titleKey: 'features.index.else.extension.title',
    descriptionKey: 'features.index.else.extension.description',
    external: {
      href: CLIPPER_WEB_STORE_URL,
      linkLabelKey: 'features.index.else.extension.linkLabel',
    },
  },
  {
    icon: Globe,
    titleKey: 'features.index.else.languages.title',
    descriptionKey: 'features.index.else.languages.description',
  },
];

function DeepDiveCopy({ feature, className = '' }: { feature: DeepDive; className?: string }) {
  const { t } = useLocale();
  return (
    <div className={className}>
      <div className="flex size-11 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
        <feature.icon className="size-5 text-stone-500 dark:text-stone-400" />
      </div>
      <h2 className="mt-5 text-2xl font-medium text-stone-900 sm:text-3xl dark:text-stone-100">
        {t(feature.titleKey)}
      </h2>
      <p className="mt-3.5 text-base/7 text-stone-600 dark:text-stone-400">
        {t(feature.descriptionKey)}
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {feature.bulletKeys.map((bulletKey) => (
          <li
            key={bulletKey}
            className="flex items-start gap-2.5 text-sm text-stone-700 dark:text-stone-300"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-stone-500 dark:text-stone-400" />
            {t(bulletKey)}
          </li>
        ))}
      </ul>
      <Link
        to={feature.to}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
      >
        {t(feature.linkLabelKey)}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function ElseEntry({ item }: { item: EverythingElseItem }) {
  const { t } = useLocale();
  const body = (
    <>
      <item.icon
        className={`mt-0.5 size-4 shrink-0 ${item.external ? 'text-blue-700 dark:text-blue-400' : 'text-stone-500 dark:text-stone-400'}`}
        aria-hidden="true"
      />
      <div>
        <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
          {t(item.titleKey)}
        </div>
        <div className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
          {t(item.descriptionKey)}
        </div>
        {item.external && (
          <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-800 dark:text-blue-400">
            {t(item.external.linkLabelKey)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </span>
        )}
      </div>
    </>
  );
  return item.external ? (
    <a
      href={item.external.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800/40"
    >
      {body}
    </a>
  ) : (
    <div className="flex gap-3">{body}</div>
  );
}

export function FeaturesIndexPage() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <MarketingHeader activeFeatures />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-14 text-center sm:pt-16">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-blue-50 to-stone-50 dark:from-stone-900 dark:to-stone-900" />
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
              {t('features.index.heroTitle')}
            </h1>
            <p className="mt-4 text-lg text-stone-600 dark:text-stone-400">
              {t('features.index.heroDescription')}
            </p>
          </div>
          {/* The product, cut off at the fold so the first screen shows it (JEF-675). */}
          <div className="mx-auto mt-10 max-h-72 max-w-5xl overflow-hidden sm:max-h-96 sm:px-6 lg:px-8">
            <ThemedScreenshot name="application-detail" priority bleed />
          </div>
        </section>

        {/* Deep dives: tracking leads wide, the other three are rows (JEF-676). */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {DEEP_DIVES.map((feature, i) => {
            const reversed = i % 2 === 0;
            return (
              <section
                key={feature.to}
                className={`py-16 sm:py-20 ${i === 0 ? '' : 'border-t border-stone-200 dark:border-stone-800'}`}
              >
                {i === 0 ? (
                  <div className="flex flex-col gap-10">
                    <DeepDiveCopy feature={feature} className="max-w-2xl" />
                    <div className="mx-auto w-full max-w-5xl">
                      <ThemedScreenshot name={feature.thumbnail} />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                    <DeepDiveCopy feature={feature} className={reversed ? 'lg:order-2' : ''} />
                    <div className={reversed ? 'lg:order-1' : ''}>
                      <ThemedScreenshot name={feature.thumbnail} />
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Everything else: a supporting list, not eight more features. */}
        <section className="mx-auto max-w-6xl border-t border-stone-200 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 dark:border-stone-800">
          <h2 className="max-w-2xl text-2xl font-medium text-stone-900 sm:text-3xl dark:text-stone-100">
            {t('features.index.everythingElseTitle')}
          </h2>
          <ul className="mt-10 grid gap-x-14 sm:grid-cols-2">
            {EVERYTHING_ELSE.map((item) => (
              <li
                key={item.titleKey}
                className="border-t border-stone-200 py-5 dark:border-stone-800"
              >
                <ElseEntry item={item} />
              </li>
            ))}
          </ul>
        </section>

        <MarketingClosingCta headline={t('features.index.ctaTitle')} />
      </main>

      <MarketingFooter />
    </div>
  );
}
