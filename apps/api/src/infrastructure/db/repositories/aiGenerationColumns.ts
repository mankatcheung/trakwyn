import type { AiGeneration } from '#src/domain/aiFeedback/AiFeedback.js';

/** The six snapshot columns `Message` and `DocumentDraft` share (JEF-547). */
export interface AiGenerationColumns {
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptVersion: number | null;
  aiSource: string | null;
  aiTier: string | null;
  aiTraceId: string | null;
}

/** The snapshot a row holds, or null when it never had one (`aiProvider` is set whenever any is). */
export function generationFromColumns(row: AiGenerationColumns): AiGeneration | null {
  if (row.aiProvider === null || row.aiSource === null) return null;
  return {
    provider: row.aiProvider,
    model: row.aiModel,
    promptVersion: row.aiPromptVersion,
    source: row.aiSource,
    tier: row.aiTier,
    traceId: row.aiTraceId,
  };
}

export function generationToColumns(
  generation: AiGeneration | null | undefined,
): AiGenerationColumns {
  return {
    aiProvider: generation?.provider ?? null,
    aiModel: generation?.model ?? null,
    aiPromptVersion: generation?.promptVersion ?? null,
    aiSource: generation?.source ?? null,
    aiTier: generation?.tier ?? null,
    aiTraceId: generation?.traceId ?? null,
  };
}
