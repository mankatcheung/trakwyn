import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DrizzleLlmUsageEventRepository } from '#src/infrastructure/db/repositories/DrizzleLlmUsageEventRepository.js';
import { createTestDb, type TestDb } from '#src/__tests__/helpers/createTestDb.js';
import { user, llmUsageEvent } from '#src/infrastructure/db/schema.js';

describe('DrizzleLlmUsageEventRepository', () => {
  let db: TestDb;
  let repo: DrizzleLlmUsageEventRepository;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new DrizzleLlmUsageEventRepository({ db: db.db });
    await db.db.insert(user).values({ id: 'u1', email: 'u@t.com', passwordHash: 'h' });
  });

  afterAll(() => db.cleanup());

  beforeEach(async () => {
    await db.db.delete(llmUsageEvent);
  });

  describe('record', () => {
    it('inserts a row', async () => {
      await repo.record({
        id: 'evt-1',
        userId: 'u1',
        provider: 'openrouter',
        model: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 20,
      });

      const summary = await repo.summarizeByUserId('u1', new Date(0));
      expect(summary).toEqual([
        {
          provider: 'openrouter',
          requestCount: 1,
          promptTokens: 100,
          completionTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          lastUsedAt: expect.any(Date),
        },
      ]);
    });

    it('persists reasoningTokens, null when the provider reports none (JEF-445)', async () => {
      await repo.record({
        id: 'evt-r',
        userId: 'u1',
        provider: 'googleai',
        model: null,
        promptTokens: 10,
        completionTokens: 8,
        reasoningTokens: 0,
      });
      await repo.record({
        id: 'evt-n',
        userId: 'u1',
        provider: 'googleai',
        model: null,
        promptTokens: 10,
        completionTokens: 8,
      });

      const rows = await db.db.select().from(llmUsageEvent);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.reasoningTokens]));
      expect(byId).toEqual({ 'evt-r': 0, 'evt-n': null });
    });

    it('persists neurons and reasoningReturned, null when omitted, and keeps a false flag (JEF-497)', async () => {
      const base = { userId: 'u1', provider: 'workersai', model: null };
      await repo.record({
        ...base,
        id: 'evt-both',
        promptTokens: 1,
        completionTokens: 1,
        neurons: 12.5,
        reasoningReturned: false,
      });
      await repo.record({
        ...base,
        id: 'evt-none',
        promptTokens: 1,
        completionTokens: 1,
      });

      const rows = await db.db.select().from(llmUsageEvent);
      const byId = Object.fromEntries(
        rows.map((r) => [r.id, { neurons: r.neurons, reasoningReturned: r.reasoningReturned }]),
      );
      expect(byId).toEqual({
        'evt-both': { neurons: 12.5, reasoningReturned: false },
        'evt-none': { neurons: null, reasoningReturned: null },
      });
    });

    it('stores the prompt version, null when the call sent no versioned prompt (JEF-505)', async () => {
      const base = { userId: 'u1', provider: 'openai', model: null, promptTokens: 1 };
      await repo.record({ ...base, id: 'evt-v', completionTokens: 1, promptVersion: 3 });
      await repo.record({ ...base, id: 'evt-n', completionTokens: 1 });

      const rows = await db.db.select().from(llmUsageEvent);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.promptVersion]));
      expect(byId).toEqual({ 'evt-v': 3, 'evt-n': null });
    });

    it('stores cost, feature and source, and leaves them null or byok when omitted (JEF-444)', async () => {
      await repo.record({
        id: 'evt-full',
        userId: 'u1',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        promptTokens: 10,
        completionTokens: 2,
        costMicros: 20,
        feature: 'coverLetter',
        source: 'byok',
      });
      await repo.record({
        id: 'evt-bare',
        userId: 'u1',
        provider: 'openai',
        model: null,
        promptTokens: 1,
        completionTokens: 1,
      });
      await repo.record({
        id: 'evt-unpriced',
        userId: 'u1',
        provider: 'xai',
        model: 'grok-x',
        promptTokens: 1,
        completionTokens: 1,
        costMicros: null,
        feature: 'chat',
      });

      const rows = await db.db.select().from(llmUsageEvent);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId['evt-full']).toMatchObject({
        costMicros: 20,
        feature: 'coverLetter',
        source: 'byok',
      });
      expect(byId['evt-bare']).toMatchObject({ costMicros: null, feature: null, source: 'byok' });
      expect(byId['evt-unpriced']).toMatchObject({ costMicros: null, feature: 'chat' });
    });

    it('persists the estimated flag, defaulting to exact (F3)', async () => {
      await repo.record({
        id: 'evt-exact',
        userId: 'u1',
        provider: 'openai',
        model: null,
        promptTokens: 10,
        completionTokens: 1,
      });
      await repo.record({
        id: 'evt-est',
        userId: 'u1',
        provider: 'openai',
        model: null,
        promptTokens: 20,
        completionTokens: 0,
        estimated: true,
      });

      const rows = await db.db.select().from(llmUsageEvent);
      expect(rows.find((r) => r.id === 'evt-exact')?.estimated).toBe(false);
      expect(rows.find((r) => r.id === 'evt-est')?.estimated).toBe(true);
      // Estimates count toward the month like any other event: the prompt was billed.
      const [summary] = await repo.summarizeByUserId('u1', new Date(0));
      expect(summary.promptTokens).toBe(30);
    });

    it('keeps the cache split when the provider reports one, and sums it (T3)', async () => {
      await repo.record({
        id: 'evt-1',
        userId: 'u1',
        provider: 'anthropic',
        model: null,
        promptTokens: 1000,
        completionTokens: 20,
        cacheReadTokens: 800,
        cacheWriteTokens: 100,
      });
      await repo.record({
        id: 'evt-2',
        userId: 'u1',
        provider: 'anthropic',
        model: null,
        promptTokens: 1000,
        completionTokens: 20,
        cacheReadTokens: 900,
        cacheWriteTokens: null,
      });

      const [summary] = await repo.summarizeByUserId('u1', new Date(0));

      expect(summary).toMatchObject({
        promptTokens: 2000,
        cacheReadTokens: 1700,
        cacheWriteTokens: 100,
      });
    });
  });

  describe('summarizeByUserId', () => {
    it('sums tokens and counts requests per provider, across every model that provider was used with', async () => {
      await repo.record({
        id: 'evt-1',
        userId: 'u1',
        provider: 'openrouter',
        model: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 20,
      });
      await repo.record({
        id: 'evt-2',
        userId: 'u1',
        provider: 'openrouter',
        model: 'gpt-4o',
        promptTokens: 200,
        completionTokens: 40,
      });

      const summary = await repo.summarizeByUserId('u1', new Date(0));

      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({
        provider: 'openrouter',
        requestCount: 2,
        promptTokens: 300,
        completionTokens: 60,
      });
    });

    it('keeps separate providers as separate rows, most-recently-used first', async () => {
      await repo.record({
        id: 'evt-1',
        userId: 'u1',
        provider: 'openrouter',
        model: null,
        promptTokens: 10,
        completionTokens: 5,
      });
      await repo.record({
        id: 'evt-2',
        userId: 'u1',
        provider: 'anthropic',
        model: null,
        promptTokens: 10,
        completionTokens: 5,
      });

      const summary = await repo.summarizeByUserId('u1', new Date(0));

      expect(summary.map((s) => s.provider)).toEqual(['anthropic', 'openrouter']);
    });

    it("does not include another user's events", async () => {
      await db.db.insert(user).values({ id: 'u2', email: 'u2@t.com', passwordHash: 'h' });
      await repo.record({
        id: 'evt-1',
        userId: 'u2',
        provider: 'openrouter',
        model: null,
        promptTokens: 10,
        completionTokens: 5,
      });

      expect(await repo.summarizeByUserId('u1', new Date(0))).toEqual([]);
    });

    it("reports lastUsedAt as the provider's most recent event, as a valid Date", async () => {
      // `expect.any(Date)` also matches an Invalid Date, which is what the mapper's
      // toISOString() threw on in production, so pin the exact instant.
      await db.db.insert(llmUsageEvent).values([
        {
          id: 'evt-earlier',
          userId: 'u1',
          provider: 'openrouter',
          model: null,
          promptTokens: 1,
          completionTokens: 1,
          createdAt: new Date('2026-10-01T08:00:00.000Z'),
        },
        {
          id: 'evt-latest',
          userId: 'u1',
          provider: 'openrouter',
          model: null,
          promptTokens: 1,
          completionTokens: 1,
          createdAt: new Date('2026-10-27T12:34:56.789Z'),
        },
      ]);

      const [summary] = await repo.summarizeByUserId('u1', new Date(0));

      expect(summary.lastUsedAt.toISOString()).toBe('2026-10-27T12:34:56.789Z');
    });

    it('returns an empty array when nothing has been recorded', async () => {
      expect(await repo.summarizeByUserId('u1', new Date(0))).toEqual([]);
    });

    it('excludes events older than `since` — how usage "resets" monthly without deleting anything', async () => {
      await db.db.insert(llmUsageEvent).values({
        id: 'evt-old',
        userId: 'u1',
        provider: 'openrouter',
        model: null,
        promptTokens: 999,
        completionTokens: 999,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      });
      await repo.record({
        id: 'evt-new',
        userId: 'u1',
        provider: 'openrouter',
        model: null,
        promptTokens: 10,
        completionTokens: 5,
      });

      const summary = await repo.summarizeByUserId('u1', new Date('2025-06-01T00:00:00.000Z'));

      expect(summary).toEqual([
        {
          provider: 'openrouter',
          requestCount: 1,
          promptTokens: 10,
          completionTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          lastUsedAt: expect.any(Date),
        },
      ]);
    });
  });

  describe('sumCostMicros (JEF-448)', () => {
    const base = {
      userId: 'u1',
      provider: 'googleai',
      model: null,
      promptTokens: 1,
      completionTokens: 1,
    };

    it('sums one source since the cutoff and ignores unpriced rows', async () => {
      await db.db
        .insert(user)
        .values({ id: 'u-cost-other', email: 'cost-other@t.com', passwordHash: 'h' });
      await repo.record({ ...base, id: 'a', costMicros: 400, source: 'platform' });
      await repo.record({ ...base, id: 'b', costMicros: 600, source: 'platform' });
      await repo.record({ ...base, id: 'c', costMicros: null, source: 'platform' });
      await repo.record({ ...base, id: 'd', costMicros: 9_000, source: 'byok' });
      await repo.record({
        ...base,
        id: 'e',
        userId: 'u-cost-other',
        costMicros: 7_000,
        source: 'platform',
      });

      expect(await repo.sumCostMicros('u1', new Date(0), 'platform')).toBe(1_000);
      expect(await repo.sumCostMicros('u1', new Date(Date.now() + 60_000), 'platform')).toBe(0);

      await db.db.delete(llmUsageEvent);
      await db.db.delete(user).where(eq(user.id, 'u-cost-other'));
    });
  });
});
