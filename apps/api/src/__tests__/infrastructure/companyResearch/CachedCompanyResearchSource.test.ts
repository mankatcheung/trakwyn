import { describe, it, expect, vi } from 'vitest';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { CachedCompanyResearchSource } from '#src/infrastructure/companyResearch/CachedCompanyResearchSource.js';
import type { CompanyResearch } from '#src/use-cases/ports/ICompanyResearchSource.js';
import { makeCompanyResearchSource } from '#src/__tests__/helpers/mocks/llm.js';

const RESEARCH: CompanyResearch = {
  pages: [{ url: 'https://acme.com', title: 'Acme', text: 'Acme makes payroll software.' }],
};

function build(research: CompanyResearch | null = RESEARCH) {
  const inner = makeCompanyResearchSource({ research: vi.fn().mockResolvedValue(research) });
  const cached = new CachedCompanyResearchSource({ cache: new MemoryCache(60_000), inner });
  return { cached, inner };
}

describe('CachedCompanyResearchSource', () => {
  it('reads the site once and serves the second caller from the cache', async () => {
    const { cached, inner } = build();

    const first = await cached.research({ company: 'Acme', jobUrl: 'https://acme.com/jobs/1' });
    const second = await cached.research({ company: 'Acme', jobUrl: 'https://acme.com/jobs/2' });

    expect(first).toEqual(RESEARCH);
    expect(second).toEqual(RESEARCH);
    expect(inner.research).toHaveBeenCalledTimes(1);
  });

  it('shares the entry between a careers subdomain and the main site, and between users', async () => {
    const { cached, inner } = build();

    await cached.research({ company: 'Acme', jobUrl: 'https://careers.acme.com/jobs/1' });
    await cached.research({ company: 'ACME Inc.', jobUrl: 'https://www.acme.com/careers' });

    expect(inner.research).toHaveBeenCalledTimes(1);
  });

  it('keeps different companies apart', async () => {
    const { cached, inner } = build();

    await cached.research({ company: 'Acme', jobUrl: 'https://acme.com/jobs/1' });
    await cached.research({ company: 'Globex', jobUrl: 'https://globex.com/jobs/1' });

    expect(inner.research).toHaveBeenCalledTimes(2);
  });

  it('makes one read for simultaneous first requests', async () => {
    const { cached, inner } = build();
    const query = { company: 'Acme', jobUrl: 'https://acme.com/jobs/1' };

    await Promise.all([cached.research(query), cached.research(query), cached.research(query)]);

    expect(inner.research).toHaveBeenCalledTimes(1);
  });

  it('does not keep an empty answer, so a site that was down is tried again', async () => {
    const { cached, inner } = build(null);
    const query = { company: 'Acme', jobUrl: 'https://acme.com/jobs/1' };

    expect(await cached.research(query)).toBeNull();
    expect(await cached.research(query)).toBeNull();

    expect(inner.research).toHaveBeenCalledTimes(2);
  });

  it('does not touch the cache or the inner source when the link names no company site', async () => {
    const { cached, inner } = build();

    expect(
      await cached.research({ company: 'Acme', jobUrl: 'https://www.linkedin.com/jobs/1' }),
    ).toBeNull();
    expect(await cached.research({ company: 'Acme', jobUrl: null })).toBeNull();

    expect(inner.research).not.toHaveBeenCalled();
  });
});
