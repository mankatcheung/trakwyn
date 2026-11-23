import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { ThemedScreenshot } from '#/features/marketing/components/ThemedScreenshot';
import { useLocale } from '#/lib/i18n';
import type { ScreenshotName } from '#/features/marketing/lib/screenshots';

export interface FeatureRowProps {
  titleKey: string;
  descriptionKey: string;
  to:
    | '/features/tracking'
    | '/features/ai-assistant'
    | '/features/resume-cover-letter'
    | '/features/analytics';
  screenshot: ScreenshotName;
  /** Puts the screenshot on the left from `lg` up; the caller alternates it. */
  reversed?: boolean;
  /** Shows a small "Pro" tag beside the title. */
  pro?: boolean;
}

/** One landing feature: copy and a "Learn more" link beside a real screenshot. */
export function FeatureRow({
  titleKey,
  descriptionKey,
  to,
  screenshot,
  reversed,
  pro,
}: FeatureRowProps) {
  const { t } = useLocale();
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14" data-testid="feature-row">
      <div className={reversed ? 'lg:order-2' : undefined}>
        <h3 className="flex items-center gap-2.5 text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          {t(titleKey)}
          {pro && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {t('plan.badgePro')}
            </span>
          )}
        </h3>
        <p className="mt-3 text-base/7 text-stone-600 dark:text-stone-400">{t(descriptionKey)}</p>
        <Link
          to={to}
          className="group mt-5 inline-flex items-center gap-1 text-sm font-medium text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
        >
          {t('landing.learnMore')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className={reversed ? 'lg:order-1' : undefined}>
        <ThemedScreenshot name={screenshot} />
      </div>
    </div>
  );
}
