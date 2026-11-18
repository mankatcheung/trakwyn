import { z } from 'zod';

// Mirrors MAX_AI_PROMPT_LENGTH in apps/api's UpdateProfileUseCase — this repo
// doesn't share validation constants across the API/web boundary.
export const MAX_AI_PROMPT_LENGTH = 500;

export const customAiPromptSchema = z.object({
  customAiPrompt: z
    .string()
    .max(MAX_AI_PROMPT_LENGTH, `Must be ${MAX_AI_PROMPT_LENGTH} characters or fewer`),
});

export const CUSTOM_LLM_PROVIDER = 'custom';

export const llmApiKeySchema = z
  .object({
    provider: z.enum([
      'openai',
      'anthropic',
      'googleai',
      'openrouter',
      'mistral',
      'groq',
      'xai',
      'deepseek',
      'nvidia',
      'custom',
    ]),
    apiKey: z.string().min(1, 'Required'),
    model: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isCustom = data.provider === CUSTOM_LLM_PROVIDER;
    if (isCustom && !data.model?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Required for a custom provider',
        path: ['model'],
      });
    }
    if (isCustom) {
      if (!data.baseUrl?.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Required for a custom provider',
          path: ['baseUrl'],
        });
      } else if (!/^https?:\/\//.test(data.baseUrl.trim())) {
        ctx.addIssue({
          code: 'custom',
          message: 'Must start with http:// or https://',
          path: ['baseUrl'],
        });
      }
    } else if (data.baseUrl?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Only valid for a custom provider',
        path: ['baseUrl'],
      });
    }
  });

export type CustomAiPromptForm = z.infer<typeof customAiPromptSchema>;
export type LlmApiKeyForm = z.infer<typeof llmApiKeySchema>;
