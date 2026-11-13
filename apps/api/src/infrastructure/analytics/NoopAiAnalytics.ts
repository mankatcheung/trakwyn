import type { IAiAnalytics } from '#src/use-cases/ports/IAiAnalytics.js';

/** Used in dev, test and any install without a PostHog key: sends nothing. */
export class NoopAiAnalytics implements IAiAnalytics {
  generation(): void {}
  span(): void {}
  feedback(): void {}
  async shutdown(): Promise<void> {}
}
