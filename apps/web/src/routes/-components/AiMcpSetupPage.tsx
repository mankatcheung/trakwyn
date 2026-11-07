import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Sparkles, Plug, ShieldCheck, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { MarketingHeader } from '#/components/marketing/MarketingHeader';
import { MarketingFooter } from '#/components/marketing/MarketingFooter';
import { useLocale } from '#/lib/i18n';

const MCP_ENDPOINT = 'https://api.trakwyn.com/mcp';

const CLAUDE_DESKTOP_CURSOR_CONFIG = `{
  "mcpServers": {
    "trakwyn": { "url": "${MCP_ENDPOINT}" }
  }
}`;

const CLAUDE_CODE_OAUTH_COMMAND = `claude mcp add --transport http trakwyn ${MCP_ENDPOINT}`;

const TOKEN_CURL_EXAMPLE = `curl -s ${MCP_ENDPOINT} \\
  -H "Authorization: Bearer trakwyn_your_token_here" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

type ProviderId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';

const PROVIDERS: Array<{ id: ProviderId; label: string; href?: string }> = [
  { id: 'openai', label: 'OpenAI', href: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', href: 'https://console.anthropic.com' },
  { id: 'google', label: 'Google AI', href: 'https://aistudio.google.com/apikey' },
  { id: 'openrouter', label: 'OpenRouter', href: 'https://openrouter.ai/keys' },
  { id: 'custom', label: 'Custom endpoint' },
];

const PROVIDER_NOTE_KEY: Record<ProviderId, string> = {
  openai: 'guides.aiMcpSetup.providerOpenaiNote',
  anthropic: 'guides.aiMcpSetup.providerAnthropicNote',
  google: 'guides.aiMcpSetup.providerGoogleNote',
  openrouter: 'guides.aiMcpSetup.providerOpenrouterNote',
  custom: 'guides.aiMcpSetup.providerCustomNote',
};

function ProviderKeyTabs() {
  const { t } = useLocale();
  const [selected, setSelected] = useState<ProviderId>('openrouter');
  const active = PROVIDERS.find((p) => p.id === selected) ?? PROVIDERS[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t('guides.aiMcpSetup.addTitle')}
        className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700"
      >
        {PROVIDERS.map((provider) => {
          const isActive = provider.id === selected;
          const label =
            provider.id === 'custom' ? t('guides.aiMcpSetup.providerCustomLabel') : provider.label;
          return (
            <button
              key={provider.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(provider.id)}
              className={
                isActive
                  ? 'border-b-2 border-blue-600 px-3.5 py-2.5 text-sm font-semibold text-blue-700 dark:text-blue-400'
                  : 'px-3.5 py-2.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        {t(PROVIDER_NOTE_KEY[active.id])}
        {active.href && (
          <a
            href={active.href}
            target="_blank"
            rel="noreferrer"
            className="ml-1 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </p>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-[12.5px] leading-relaxed text-gray-100">
      {children}
    </pre>
  );
}

function SectionHeading({
  id,
  eyebrowIcon: Icon,
  children,
}: {
  id: string;
  eyebrowIcon: typeof Sparkles;
  children: string;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
        <Icon className="size-4" />
      </span>
      <h2 className="text-xl font-bold text-gray-900 sm:text-2xl dark:text-gray-100">{children}</h2>
    </div>
  );
}

function TocLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="block rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
    >
      {children}
    </a>
  );
}

function TocHeading({ children }: { children: string }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase first:pt-0 dark:text-gray-500">
      {children}
    </div>
  );
}

export function AiMcpSetupPage() {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <MarketingHeader activeGuide />

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400">
            <Sparkles className="size-3.5" />
            {t('guides.aiMcpSetup.eyebrow')}
          </div>
          <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
            {t('guides.aiMcpSetup.title')}
          </h1>
          <p className="mt-3 text-base/7 text-gray-600 dark:text-gray-400">
            {t('guides.aiMcpSetup.description')}
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-start">
          <nav
            aria-label={t('guides.aiMcpSetup.title')}
            className="top-6 flex-col gap-0.5 lg:sticky lg:flex lg:w-52 lg:shrink-0"
          >
            <TocHeading>{t('guides.aiMcpSetup.tocByok')}</TocHeading>
            <TocLink href="#what-byok-means">{t('guides.aiMcpSetup.tocByokWhat')}</TocLink>
            <TocLink href="#where-cost-lands">{t('guides.aiMcpSetup.tocByokCost')}</TocLink>
            <TocLink href="#how-key-stored">{t('guides.aiMcpSetup.tocByokStorage')}</TocLink>
            <TocLink href="#add-provider-key">{t('guides.aiMcpSetup.tocByokAdd')}</TocLink>
            <TocLink href="#what-to-expect">{t('guides.aiMcpSetup.tocByokExpect')}</TocLink>
            <TocHeading>{t('guides.aiMcpSetup.tocMcp')}</TocHeading>
            <TocLink href="#what-mcp-exposes">{t('guides.aiMcpSetup.tocMcpExposes')}</TocLink>
            <TocLink href="#connect-oauth">{t('guides.aiMcpSetup.tocMcpOauth')}</TocLink>
            <TocLink href="#manage-clients">{t('guides.aiMcpSetup.tocMcpManage')}</TocLink>
            <TocLink href="#client-configs">{t('guides.aiMcpSetup.tocMcpConfigs')}</TocLink>
            <TocLink href="#api-token">{t('guides.aiMcpSetup.tocMcpToken')}</TocLink>
          </nav>

          <article className="max-w-2xl min-w-0 flex-1">
            {/* Part 1 — BYOK */}
            <section className="flex flex-col gap-8">
              <SectionHeading id="part-1" eyebrowIcon={Sparkles}>
                {t('guides.aiMcpSetup.part1Heading')}
              </SectionHeading>

              <div id="what-byok-means" className="scroll-mt-24">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('guides.aiMcpSetup.whatTitle')}
                </h3>
                <p className="mt-2 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.whatBody')}
                </p>
              </div>

              <div
                id="where-cost-lands"
                className="flex scroll-mt-24 gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/20"
              >
                <Info className="mt-0.5 size-4.5 shrink-0 text-blue-700 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                    {t('guides.aiMcpSetup.costTitle')}
                  </p>
                  <p className="mt-1 text-sm/relaxed text-blue-800 dark:text-blue-400">
                    {t('guides.aiMcpSetup.costBody')}
                  </p>
                </div>
              </div>

              <div id="how-key-stored" className="scroll-mt-24">
                <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                  <ShieldCheck className="size-4 text-gray-500 dark:text-gray-400" />
                  {t('guides.aiMcpSetup.storageTitle')}
                </h3>
                <p className="mt-2 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.storageBody')}
                </p>
              </div>

              <div id="add-provider-key" className="scroll-mt-24">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('guides.aiMcpSetup.addTitle')}
                </h3>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  <li>{t('guides.aiMcpSetup.addStep1')}</li>
                  <li>{t('guides.aiMcpSetup.addStep2')}</li>
                  <li>{t('guides.aiMcpSetup.addStep3')}</li>
                </ol>
                <div className="mt-4">
                  <ProviderKeyTabs />
                </div>
              </div>

              <div
                id="what-to-expect"
                className="flex scroll-mt-24 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20"
              >
                <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                    {t('guides.aiMcpSetup.expectTitle')}
                  </p>
                  <p className="mt-1 text-sm/relaxed text-amber-800 dark:text-amber-400">
                    {t('guides.aiMcpSetup.expectBody')}
                  </p>
                </div>
              </div>
            </section>

            <hr className="my-10 border-gray-200 dark:border-gray-800" />

            {/* Part 2 — MCP */}
            <section className="flex flex-col gap-8">
              <SectionHeading id="part-2" eyebrowIcon={Plug}>
                {t('guides.aiMcpSetup.part2Heading')}
              </SectionHeading>

              <div id="what-mcp-exposes" className="scroll-mt-24">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('guides.aiMcpSetup.exposesTitle')}
                </h3>
                <p className="mt-2 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.exposesBody')}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/50">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {t('guides.aiMcpSetup.readToolsTitle')}
                    </p>
                    <p className="mt-1 text-xs/relaxed text-gray-500 dark:text-gray-400">
                      {t('guides.aiMcpSetup.readToolsBody')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/50">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {t('guides.aiMcpSetup.writeToolsTitle')}{' '}
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        — {t('guides.aiMcpSetup.writeToolsBadge')}
                      </span>
                    </p>
                    <p className="mt-1 text-xs/relaxed text-gray-500 dark:text-gray-400">
                      {t('guides.aiMcpSetup.writeToolsBody')}
                    </p>
                  </div>
                </div>
              </div>

              <div id="connect-oauth" className="scroll-mt-24">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t('guides.aiMcpSetup.oauthTitle')}
                  </h3>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {t('guides.aiMcpSetup.oauthBadge')}
                  </span>
                </div>
                <p className="mt-2 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.oauthIntro')}
                </p>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  <li>{t('guides.aiMcpSetup.oauthStep1')}</li>
                  <li>{t('guides.aiMcpSetup.oauthStep2')}</li>
                  <li>{t('guides.aiMcpSetup.oauthStep3')}</li>
                  <li>{t('guides.aiMcpSetup.oauthStep4')}</li>
                </ol>
                <code className="mt-3 block rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                  {MCP_ENDPOINT}
                </code>
                <p className="mt-3 text-xs/relaxed text-gray-500 dark:text-gray-400">
                  {t('guides.aiMcpSetup.oauthRevoke')}
                </p>
              </div>

              <div id="manage-clients" className="scroll-mt-24">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('guides.aiMcpSetup.manageTitle')}
                </h3>
                <p className="mt-2 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.manageBody')}
                </p>
              </div>

              <div id="client-configs" className="scroll-mt-24">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('guides.aiMcpSetup.configsTitle')}
                </h3>
                <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.configsClaudeCursorLabel')}
                </p>
                <div className="mt-2">
                  <CodeBlock>{CLAUDE_DESKTOP_CURSOR_CONFIG}</CodeBlock>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t('guides.aiMcpSetup.configsClaudeCursorNote')}
                </p>
                <p className="mt-5 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.configsClaudeCodeLabel')}
                </p>
                <div className="mt-2">
                  <CodeBlock>{CLAUDE_CODE_OAUTH_COMMAND}</CodeBlock>
                </div>
              </div>

              <div
                id="api-token"
                className="scroll-mt-24 rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/30"
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t('guides.aiMcpSetup.tokenTitle')}
                </h3>
                <p className="mt-2 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.tokenIntro')}
                </p>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm/relaxed text-gray-700 dark:text-gray-300">
                  <li>{t('guides.aiMcpSetup.tokenStep1')}</li>
                  <li>{t('guides.aiMcpSetup.tokenStep2')}</li>
                  <li>{t('guides.aiMcpSetup.tokenStep3')}</li>
                  <li>{t('guides.aiMcpSetup.tokenStep4')}</li>
                </ol>
                <p className="mt-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('guides.aiMcpSetup.tokenCurlLabel')}
                </p>
                <div className="mt-2">
                  <CodeBlock>{TOKEN_CURL_EXAMPLE}</CodeBlock>
                </div>
              </div>
            </section>

            <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-gray-200 pt-6 dark:border-gray-800">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('guides.aiMcpSetup.alreadyUser')}
              </p>
              <Link
                to="/settings/ai"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t('guides.aiMcpSetup.ctaSettingsAi')}
              </Link>
              <Link
                to="/settings/integrations"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {t('guides.aiMcpSetup.ctaSettingsIntegrations')}
              </Link>
            </div>
          </article>
        </div>
      </main>

      <section className="bg-blue-600 px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">
          {t('guides.aiMcpSetup.ctaHeadline')}
        </h2>
        <Link
          to="/register"
          className="mt-6 inline-block rounded-lg bg-white px-7 py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50"
        >
          {t('landing.startFree')}
        </Link>
      </section>

      <MarketingFooter />
    </div>
  );
}
