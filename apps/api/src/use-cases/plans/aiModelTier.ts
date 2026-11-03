import type { Plan } from '#src/domain/plan/Plan.js';
import { AI_MODEL_TIER, type AiFeature, type AiModelTier } from '#src/use-cases/constants.js';

/** The model tier a plan gets for a feature (JEF-448). */
export function aiModelTier(plan: Plan, feature: AiFeature): AiModelTier {
  const table: Partial<Record<AiFeature, AiModelTier>> & { default: AiModelTier } =
    AI_MODEL_TIER[plan];
  return table[feature] ?? table.default;
}
