import type { LucideIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';

interface SetupGuideBannerProps {
  icon: LucideIcon;
  /** Key of the sentence that says what the guide covers. */
  textKey: string;
}

/**
 * A pointer to the AI and MCP setup guide, at the top of the settings pages it explains.
 * A standard white card, with the accent on the link only (JEF-693).
 */
export function SetupGuideBanner({ icon: Icon, textKey }: SetupGuideBannerProps) {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-700 dark:bg-stone-800">
      <div className="flex items-center gap-3">
        <Icon className="size-4.5 shrink-0 text-stone-400 dark:text-stone-500" aria-hidden="true" />
        <p className="text-sm text-stone-700 dark:text-stone-300">{t(textKey)}</p>
      </div>
      <Link
        to="/ai-mcp-setup"
        className="shrink-0 text-sm font-medium text-blue-800 hover:underline dark:text-blue-400"
      >
        {t('guides.aiMcpSetup.bannerLink')}
      </Link>
    </div>
  );
}
