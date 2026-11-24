import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useLocale } from '#/lib/i18n';

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

export function ProviderKeyTabs() {
  const { t } = useLocale();
  const [selected, setSelected] = useState<ProviderId>('openrouter');
  const active = PROVIDERS.find((p) => p.id === selected) ?? PROVIDERS[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label={t('guides.aiMcpSetup.addTitle')}
        className="flex flex-wrap gap-1 border-b border-stone-200 dark:border-stone-700"
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
                  ? 'border-b-2 border-blue-800 px-3.5 py-2.5 text-sm font-medium text-stone-900 underline decoration-stone-400 decoration-1 underline-offset-8 dark:text-stone-100 dark:decoration-stone-500'
                  : 'px-3.5 py-2.5 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        {t(PROVIDER_NOTE_KEY[active.id])}
        {active.href && (
          <a
            href={active.href}
            target="_blank"
            rel="noreferrer"
            aria-label={t('guides.aiMcpSetup.providerKeyLink', { provider: active.label })}
            className="ml-1 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </p>
    </div>
  );
}
