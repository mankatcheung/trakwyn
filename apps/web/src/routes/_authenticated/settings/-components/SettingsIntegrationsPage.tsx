import { PlugIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useLocale } from '#/lib/i18n';
import { ApiTokensCard } from './ApiTokensCard';
import { McpClientsCard } from './McpClientsCard';
import { ShareLinksCard } from './ShareLinksCard';

export function SettingsIntegrationsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/20">
        <div className="flex items-center gap-3">
          <PlugIcon className="size-4.5 shrink-0 text-blue-700 dark:text-blue-400" />
          <p className="text-sm text-blue-900 dark:text-blue-300">
            {t('guides.aiMcpSetup.bannerIntegrationsText')}
          </p>
        </div>
        <Link
          to="/ai-mcp-setup"
          className="shrink-0 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
        >
          {t('guides.aiMcpSetup.bannerLink')}
        </Link>
      </div>

      <ApiTokensCard />
      <McpClientsCard />
      <ShareLinksCard />
    </div>
  );
}
