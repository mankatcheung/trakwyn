import { graphql } from '#/graphql/generated';

/** Documents for Settings → AI: saved provider keys, their usage and the provider order. */

export const LLM_API_KEYS_QUERY = graphql(`
  query LlmApiKeys {
    llmApiKeys {
      provider
      model
      baseUrl
      monthlyTokenLimit
    }
    me {
      aiProviderOrder
      customAiPrompt
      useCrossApplicationContext
    }
  }
`);

export const SET_AI_PROVIDER_ORDER = graphql(`
  mutation SetAiProviderOrder($order: [String!]!) {
    setAiProviderOrder(order: $order)
  }
`);

export const SAVE_LLM_API_KEY = graphql(`
  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {
    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)
  }
`);

export const DELETE_LLM_API_KEY = graphql(`
  mutation DeleteLlmApiKey($provider: String!) {
    deleteLlmApiKey(provider: $provider)
  }
`);

export const SET_LLM_API_KEY_MONTHLY_LIMIT = graphql(`
  mutation SetLlmApiKeyMonthlyLimit($provider: String!, $monthlyTokenLimit: Int) {
    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $monthlyTokenLimit)
  }
`);

export const TEST_LLM_API_KEY = graphql(`
  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {
    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {
      ok
      error
    }
  }
`);

export const LLM_USAGE_SUMMARY_QUERY = graphql(`
  query LlmUsageSummary {
    llmUsageSummary {
      provider
      requestCount
      promptTokens
      completionTokens
      cacheReadTokens
      cacheWriteTokens
      lastUsedAt
      monthlyTokenLimit
      limitReached
    }
  }
`);
