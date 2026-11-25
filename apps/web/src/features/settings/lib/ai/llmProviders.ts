import { CUSTOM_LLM_PROVIDER } from './aiSchemas';

export const LLM_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'googleai', label: 'Google AI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'groq', label: 'Groq' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'nvidia', label: 'NVIDIA NIM' },
  { value: CUSTOM_LLM_PROVIDER, label: 'Custom (OpenAI-compatible)' },
];

/**
 * Where each provider says how it handles API content (JEF-549). Shown under the
 * provider picker so a user can read the policy that governs their own key.
 * `custom` has none: the endpoint's operator decides. Last checked: see
 * `docs/ai-data-handling.md`.
 */
export const LLM_PROVIDER_DATA_USE_URL: Record<string, string> = {
  openai: 'https://platform.openai.com/docs/guides/your-data',
  anthropic: 'https://www.anthropic.com/legal/privacy',
  googleai: 'https://ai.google.dev/gemini-api/terms',
  openrouter: 'https://openrouter.ai/docs/guides/privacy/logging',
  mistral: 'https://legal.mistral.ai/terms/privacy-policy',
  groq: 'https://groq.com/privacy-policy',
  xai: 'https://x.ai/legal/privacy-policy',
  deepseek: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
  nvidia: 'https://www.nvidia.com/en-us/about-nvidia/privacy-policy/',
};

/** The data-use link for a provider, or null when it has none or is not an `https:` URL. */
export function llmProviderDataUseUrl(provider: string): string | null {
  const raw = LLM_PROVIDER_DATA_USE_URL[provider];
  if (!raw) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

export const LLM_PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  LLM_PROVIDER_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * A small colored monogram per provider, purely a visual scanning aid in the
 * saved-keys list — not a brand mark (no logos), so it's safe to invent.
 * Reuses the exact tone pairs `Badge`'s `TONE_CLASSES` defines, for the same
 * "light bg-100/text-700, dark bg-900/30/text-400" look used everywhere else
 * a status color appears. 10 providers over 9 tones — `custom` intentionally
 * doubles up with `deepseek`'s neutral gray, since "custom" has no brand of
 * its own to distinguish.
 */
export const LLM_PROVIDER_AVATAR: Record<string, { initials: string; className: string }> = {
  openai: {
    initials: 'AI',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  anthropic: {
    initials: 'AN',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  googleai: {
    initials: 'G',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  openrouter: {
    initials: 'OR',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  mistral: {
    initials: 'MI',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  groq: {
    initials: 'GQ',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  xai: {
    initials: 'X',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  deepseek: {
    initials: 'DS',
    className: 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-300',
  },
  nvidia: {
    initials: 'NV',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  [CUSTOM_LLM_PROVIDER]: {
    initials: 'C',
    className: 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-300',
  },
};
