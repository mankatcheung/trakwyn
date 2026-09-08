import { GoogleAILLMProvider } from '#src/infrastructure/llm/GoogleAILLMProvider.js';
import { AnthropicLLMProvider } from '#src/infrastructure/llm/AnthropicLLMProvider.js';
import { OpenAICompatibleLLMProvider } from '#src/infrastructure/llm/OpenAICompatibleLLMProvider.js';
import { LLM, LLM_PROVIDER } from '#src/use-cases/constants.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';

export interface LLMProviderCreateParams {
  apiKey: string;
  /** `model`/`baseUrl` are the user's stored overrides — null unless explicitly set. */
  model: string | null;
  baseUrl: string | null;
  /** Consulted only by the entry whose endpoint the user chose (`custom`). */
  outboundUrlPolicy?: IOutboundUrlPolicy;
}

export interface LLMProviderRegistryEntry {
  label: string;
  create(params: LLMProviderCreateParams): ILLMProvider;
}

/**
 * One entry per supported provider — adding a new one is a registry entry,
 * not new branching logic in the factory that consumes this. Most entries
 * reuse `OpenAICompatibleLLMProvider` since they all implement OpenAI's
 * `/chat/completions` shape; only Anthropic and Google AI need bespoke
 * provider classes.
 */
export const PROVIDER_REGISTRY: Record<string, LLMProviderRegistryEntry> = {
  [LLM_PROVIDER.OPENAI]: {
    label: 'OpenAI',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(
        apiKey,
        LLM.OPENAI_API_URL,
        model ?? LLM.OPENAI_DEFAULT_MODEL,
      ),
  },
  [LLM_PROVIDER.ANTHROPIC]: {
    label: 'Anthropic (Claude)',
    create: ({ apiKey, model }) => new AnthropicLLMProvider(apiKey, model ?? undefined),
  },
  [LLM_PROVIDER.GOOGLEAI]: {
    label: 'Google AI',
    create: ({ apiKey, model }) => new GoogleAILLMProvider(apiKey, model ?? undefined),
  },
  [LLM_PROVIDER.OPENROUTER]: {
    label: 'OpenRouter',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(
        apiKey,
        LLM.OPENROUTER_API_URL,
        model ?? LLM.OPENROUTER_DEFAULT_MODEL,
      ),
  },
  [LLM_PROVIDER.MISTRAL]: {
    label: 'Mistral',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(
        apiKey,
        LLM.MISTRAL_API_URL,
        model ?? LLM.MISTRAL_DEFAULT_MODEL,
      ),
  },
  [LLM_PROVIDER.GROQ]: {
    label: 'Groq',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(apiKey, LLM.GROQ_API_URL, model ?? LLM.GROQ_DEFAULT_MODEL),
  },
  [LLM_PROVIDER.XAI]: {
    label: 'xAI (Grok)',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(apiKey, LLM.XAI_API_URL, model ?? LLM.XAI_DEFAULT_MODEL),
  },
  [LLM_PROVIDER.DEEPSEEK]: {
    label: 'DeepSeek',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(
        apiKey,
        LLM.DEEPSEEK_API_URL,
        model ?? LLM.DEEPSEEK_DEFAULT_MODEL,
      ),
  },
  [LLM_PROVIDER.NVIDIA]: {
    label: 'NVIDIA NIM',
    create: ({ apiKey, model }) =>
      new OpenAICompatibleLLMProvider(
        apiKey,
        LLM.NVIDIA_API_URL,
        model ?? LLM.NVIDIA_DEFAULT_MODEL,
      ),
  },
  [LLM_PROVIDER.CUSTOM]: {
    label: 'Custom (OpenAI-compatible)',
    create: ({ apiKey, model, baseUrl, outboundUrlPolicy }) => {
      if (!baseUrl || !model) {
        throw new Error('Custom provider requires both a base URL and a model');
      }
      return new OpenAICompatibleLLMProvider(apiKey, baseUrl, model, outboundUrlPolicy);
    },
  },
};
