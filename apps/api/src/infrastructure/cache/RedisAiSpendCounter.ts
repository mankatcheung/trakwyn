import type { IRedisClient } from '#src/infrastructure/cache/IRedisClient.js';
import type { IAiSpendCounter } from '#src/infrastructure/cache/IAiSpendCounter.js';
import { HOSTED_AI_SPEND } from '#src/infrastructure/config/constants.js';

/** What the counter needs of Redis; `IRedisClient` plus `INCRBY`, which nothing else uses. */
export type SpendRedisClient = Pick<IRedisClient, 'get' | 'set'> & {
  incrby(key: string, by: number): Promise<number>;
};

/**
 * The spend counter in Redis, shared by every instance (JEF-449). Errors are
 * not caught: the guard turns a failed read into a refusal.
 *
 * The key is created with its TTL by `SET NX PX` before the `INCRBY`, so a
 * crash between the two cannot leave a counter that never expires.
 */
export class RedisAiSpendCounter implements IAiSpendCounter {
  constructor(private readonly redis: SpendRedisClient) {}

  async get(key: string): Promise<number> {
    const value = await this.redis.get<number | string>(key);
    return value === null ? 0 : Number(value);
  }

  async add(key: string, micros: number): Promise<void> {
    await this.redis.set(key, 0, { nx: true, px: HOSTED_AI_SPEND.TTL_MS });
    await this.redis.incrby(key, Math.round(micros));
  }
}
