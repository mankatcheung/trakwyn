import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { CachedCompanySearchSource } from '#src/infrastructure/companyResearch/CachedCompanySearchSource.js';
import type { CompanyResearch } from '#src/use-cases/ports/ICompanyResearchSource.js';
import { makeCompanyResearchSource } from '#src/__tests__/helpers/mocks/llm.js';

const RESEARCH: CompanyResearch = {
  pages: [
    {
      url: 'https://news.example/acme',
      title: 'Acme raises Series B',
      text: 'Acme raised a Series B.',
      publishedAt: '2026-03-12T00:00:00.000Z',
    },
  ],
};

function build(research: CompanyResearch | null = RESEARCH) {
  const inner = makeCompanyResearchSource({ research: vi.fn().mockResolvedValue(research) });
  const cached = new CachedCompanySearchSource({ cache: new MemoryCache(60_000), inner });
  return { cached, inner };
}

describe('CachedCompanySearchSource', () => {
  it('searches once and serves the second user from the cache', async () => {
    const { cached, inner } = build();

    const first = await cached.research({ company: 'Acme', jobUrl: 'https://acme.com/jobs/1' });
    const second = await cached.research({ company: 'Acme', jobUrl: 'https://acme.com/jobs/2' });

    expect(first).toEqual(RESEARCH);
    expect(second).toEqual(RESEARCH);
    expect(inner.research).toHaveBeenCalledTimes(1);
  });

  it('shares the entry across spelling and spacing of the name, and a careers subdomain', async () => {
    const { cached, inner } = build();

    await cached.research({ company: 'Acme  Corp', jobUrl: 'https://careers.acme.com/jobs/1' });
    await cached.research({ company: 'ACME corp', jobUrl: 'https://www.acme.com/careers' });

    expect(inner.research).toHaveBeenCalledTimes(1);
  });

  it('keeps different companies apart, and the same name on different sites apart', async () => {
    const { cached, inner } = build();

    await cached.research({ company: 'Acme', jobUrl: 'https://acme.com/jobs/1' });
    await cached.research({ company: 'Globex', jobUrl: 'https://acme.com/jobs/1' });
    await cached.research({ company: 'Acme', jobUrl: 'https://acme.io/jobs/1' });
    await cached.research({ company: 'Acme', jobUrl: null });

    expect(inner.research).toHaveBeenCalledTimes(4);
  });

  it('makes one search for simultaneous first briefings', async () => {
    const { cached, inner } = build();
    const query = { company: 'Acme', jobUrl: 'https://acme.com/jobs/1' };

    await Promise.all([cached.research(query), cached.research(query), cached.research(query)]);

    expect(inner.research).toHaveBeenCalledTimes(1);
  });

  it('does not keep an empty answer, so the next briefing searches again', async () => {
    const { cached, inner } = build(null);
    const query = { company: 'Acme', jobUrl: 'https://acme.com/jobs/1' };

    await expect(cached.research(query)).resolves.toBeNull();
    await expect(cached.research(query)).resolves.toBeNull();

    expect(inner.research).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed search, and lets the failure through', async () => {
    const inner = makeCompanyResearchSource({
      research: vi
        .fn()
        .mockRejectedValueOnce(new Error('Tavily 432'))
        .mockResolvedValueOnce(RESEARCH),
    });
    const cached = new CachedCompanySearchSource({ cache: new MemoryCache(60_000), inner });
    const query = { company: 'Acme', jobUrl: 'https://acme.com/jobs/1' };

    await expect(cached.research(query)).rejects.toThrow('Tavily 432');
    await expect(cached.research(query)).resolves.toEqual(RESEARCH);
  });

  it('searches for nothing when the name is empty', async () => {
    const { cached, inner } = build();

    await expect(cached.research({ company: '  ', jobUrl: null })).resolves.toBeNull();
    expect(inner.research).not.toHaveBeenCalled();
  });

  it('keeps a result’s date through the cache', async () => {
    const { cached } = build();
    const query = { company: 'Acme', jobUrl: 'https://acme.com/jobs/1' };

    await cached.research(query);
    const second = await cached.research(query);

    expect(second?.pages[0].publishedAt).toBe('2026-03-12T00:00:00.000Z');
  });
});
