/**
 * Which model and prompt wrote one piece of AI output (JEF-547), snapshotted
 * onto the output when it is written. After a failover it names the provider
 * that answered, not the one that was tried first. `null` on output from
 * before the snapshot existed.
 */
export type AiGeneration = {
  provider: string;
  model: string | null;
  promptVersion: number | null;
  /** `LlmUsageSource`: `byok` is the user's own key. */
  source: string;
  /** The hosted model tier; null on the user's own key. */
  tier: string | null;
};

/**
 * A user's rating of one piece of AI output. It holds no message or draft
 * text, only the facts that tell us which feature, model and prompt version
 * to write eval cases for.
 */
export type AiFeedback = {
  id: string;
  userId: string;
  /** `AiFeedbackTarget`. */
  targetKind: string;
  /** Not a foreign key: messages are trimmed, and the signal should outlive them. */
  targetId: string;
  /** The `AiFeature` that produced the output. */
  feature: string;
  /** `AiFeedbackRating`. */
  rating: string;
  /** `AiFeedbackReason`; only ever set on a down-vote. */
  reason: string | null;
  /** Null when the output predates the generation snapshot. */
  generation: AiGeneration | null;
  createdAt: Date;
  updatedAt: Date;
};
