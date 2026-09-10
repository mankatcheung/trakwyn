import { builder } from '#src/http/schema/builder.js';
import type { LlmUsageSummaryDTO } from '#src/interface-adapters/mappers/LlmUsageSummaryMapper.js';

export const LlmUsageSummaryRef = builder.objectRef<LlmUsageSummaryDTO>('LlmUsageSummary');
LlmUsageSummaryRef.implement({
  fields: (t) => ({
    provider: t.exposeString('provider'),
    requestCount: t.exposeInt('requestCount'),
    promptTokens: t.exposeInt('promptTokens'),
    completionTokens: t.exposeInt('completionTokens'),
    /** Share of promptTokens served from / written to the provider's prompt cache this month (T3). */
    cacheReadTokens: t.exposeInt('cacheReadTokens'),
    cacheWriteTokens: t.exposeInt('cacheWriteTokens'),
    lastUsedAt: t.exposeString('lastUsedAt'),
    monthlyTokenLimit: t.exposeInt('monthlyTokenLimit', { nullable: true }),
    limitReached: t.exposeBoolean('limitReached'),
  }),
});
