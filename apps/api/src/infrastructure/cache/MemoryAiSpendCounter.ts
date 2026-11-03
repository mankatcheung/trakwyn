import type { IAiSpendCounter } from '#src/infrastructure/cache/IAiSpendCounter.js';

/**
 * In-process spend counter for local dev and tests. Not shared across
 * instances, which is the reason production uses `RedisAiSpendCounter`.
 */
export class MemoryAiSpendCounter implements IAiSpendCounter {
  private readonly totals = new Map<string, number>();

  async get(key: string): Promise<number> {
    return this.totals.get(key) ?? 0;
  }

  async add(key: string, micros: number): Promise<void> {
    this.totals.set(key, (this.totals.get(key) ?? 0) + micros);
  }
}
