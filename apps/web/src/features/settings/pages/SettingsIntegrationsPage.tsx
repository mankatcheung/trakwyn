import { PlugIcon } from 'lucide-react';
import { SetupGuideBanner } from '../components/SetupGuideBanner';
import { ApiTokensCard } from '../components/integrations/ApiTokensCard';
import { McpClientsCard } from '../components/integrations/McpClientsCard';
import { ShareLinksCard } from '../components/integrations/ShareLinksCard';

export function SettingsIntegrationsPage() {
  return (
    <div className="space-y-8">
      <SetupGuideBanner icon={PlugIcon} textKey="guides.aiMcpSetup.bannerIntegrationsText" />

      <ApiTokensCard />
      <McpClientsCard />
      <ShareLinksCard />
    </div>
  );
}
