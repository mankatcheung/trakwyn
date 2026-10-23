import { Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Sparkles,
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
import { MarketingHeader } from '#/components/marketing/MarketingHeader';
import { MarketingFooter } from '#/components/marketing/MarketingFooter';
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
  thumbnail: React.ReactNode;
}

function KanbanThumb() {
  const { t } = useLocale();
  return (
    <div className="flex gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
      {(['applied', 'interviewing', 'accepted'] as const).map((status) => {
        const colors = {
          applied: 'border-t-blue-500 text-blue-700 dark:text-blue-400',
          interviewing: 'border-t-purple-500 text-purple-700 dark:text-purple-400',
          accepted: 'border-t-green-500 text-green-700 dark:text-green-400',
        }[status];
        return (
          <div
            key={status}
            className={`flex-1 rounded-md border border-t-[3px] border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800 ${colors}`}
          >
            <div className="text-[10px] font-bold">{t(`status.${status}`)}</div>
            <div className="mt-1.5 h-4 rounded-sm border border-gray-200 dark:border-gray-700" />
          </div>
        );
      })}
    </div>
  );
}

function ChatThumb() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
      <div className="max-w-[75%] self-end rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] text-white">
        {t('features.index.thumbChatQuestion')}
      </div>
      <div className="max-w-[82%] self-start rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {t('features.index.thumbChatAnswer')}
      </div>
    </div>
  );
}

function ResumeThumb() {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
      <div className="text-[11px] font-bold text-gray-900 dark:text-gray-100">{'Priya Anand'}</div>
      <div className="mt-1.5 space-y-1">
        <div className="h-1 w-3/4 rounded-sm bg-gray-300 dark:bg-gray-600" />
        <div className="h-1 w-11/12 rounded-sm bg-gray-300 dark:bg-gray-600" />
        <div className="h-1 w-2/3 rounded-sm bg-blue-300 dark:bg-blue-700" />
      </div>
    </div>
  );
}

function AnalyticsThumb() {
  return (
    <div className="flex h-16 items-end gap-1.5 rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40">
      {[90, 70, 42, 18, 10].map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-blue-500"
          style={{ height: `${h}%`, opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
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
    thumbnail: <KanbanThumb />,
  },
  {
    icon: Sparkles,
    titleKey: 'features.index.aiAssistant.title',
    descriptionKey: 'features.index.aiAssistant.description',
    bulletKeys: [
      'features.index.aiAssistant.bullet1',
      'features.index.aiAssistant.bullet2',
      'features.index.aiAssistant.bullet3',
    ],
    to: '/features/ai-assistant',
    linkLabelKey: 'features.index.aiAssistant.linkLabel',
    thumbnail: <ChatThumb />,
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
    thumbnail: <ResumeThumb />,
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
    thumbnail: <AnalyticsThumb />,
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

export function FeaturesIndexPage() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <MarketingHeader activeFeatures />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-20 text-center sm:py-24">
          <div className="absolute inset-0 -z-10 bg-linear-to-b from-blue-50 to-gray-50 dark:from-gray-900 dark:to-gray-900" />
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-gray-100">
              {t('features.index.heroTitle')}
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              {t('features.index.heroDescription')}
            </p>
          </div>
        </section>

        {/* Deep dives */}
        {DEEP_DIVES.map((feature, i) => {
          const reversed = i % 2 === 1;
          return (
            <div key={feature.to} className={reversed ? 'bg-gray-100 dark:bg-gray-800/30' : ''}>
              <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                  <div className={reversed ? 'lg:order-2' : ''}>
                    <div className="flex size-11 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                      <feature.icon className="size-5 text-blue-600" />
                    </div>
                    <h2 className="mt-5 text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
                      {t(feature.titleKey)}
                    </h2>
                    <p className="mt-3.5 text-base/7 text-gray-600 dark:text-gray-400">
                      {t(feature.descriptionKey)}
                    </p>
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {feature.bulletKeys.map((bulletKey) => (
                        <li
                          key={bulletKey}
                          className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300"
                        >
                          <Check className="mt-0.5 size-4 shrink-0 text-blue-600" />
                          {t(bulletKey)}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={feature.to}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {t(feature.linkLabelKey)} →
                    </Link>
                  </div>
                  <div
                    className={`rounded-2xl border border-gray-200 bg-white p-3 shadow-lg shadow-gray-900/5 dark:border-gray-800 dark:bg-gray-800/50 ${reversed ? 'lg:order-1' : ''}`}
                  >
                    {feature.thumbnail}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Everything else */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
            {t('features.index.everythingElseTitle')}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {EVERYTHING_ELSE.map((item) => {
              const content = (
                <>
                  <item.icon
                    className={`size-4 ${item.external ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400'}`}
                  />
                  <div className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t(item.titleKey)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t(item.descriptionKey)}
                  </div>
                  {item.external && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {t(item.external.linkLabelKey)}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              return item.external ? (
                <a
                  key={item.titleKey}
                  href={item.external.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-blue-200 p-4 transition-colors hover:border-blue-400 dark:border-blue-900 dark:hover:border-blue-700"
                >
                  {content}
                </a>
              ) : (
                <div
                  key={item.titleKey}
                  className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-blue-600 px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white">{t('features.index.ctaTitle')}</h2>
          <Link
            to="/register"
            className="mt-7 inline-block rounded-lg bg-white px-7 py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            {t('landing.getStartedFree')}
          </Link>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
