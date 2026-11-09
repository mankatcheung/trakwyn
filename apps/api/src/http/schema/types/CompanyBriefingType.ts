import { builder } from '#src/http/schema/builder.js';
import type {
  CompanyBriefingDTO,
  CompanySourceDTO,
} from '#src/interface-adapters/mappers/CompanyBriefingMapper.js';

export const CompanySourceRef = builder.objectRef<CompanySourceDTO>('CompanySource');
CompanySourceRef.implement({
  fields: (t) => ({
    url: t.exposeString('url'),
    title: t.exposeString('title'),
    // When a web search result was published (JEF-538); null for the
    // company's own pages. Optional output, so a client built before it never
    // asks for it.
    publishedAt: t.exposeString('publishedAt', { nullable: true }),
  }),
});

export const CompanyBriefingRef = builder.objectRef<CompanyBriefingDTO>('CompanyBriefing');
CompanyBriefingRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    content: t.exposeString('content'),
    // The pages the briefing was written from, numbered `[1]`, `[2]` in the
    // same order in `content`. Empty when none could be read. A new field, so
    // a client built before it simply never asks for it (JEF-417).
    sources: t.field({ type: [CompanySourceRef], resolve: (briefing) => briefing.sources }),
    // Lets the tab say how old the briefing is, so a stale one is visibly
    // stale rather than silently presented as current.
    generatedAt: t.exposeString('generatedAt'),
  }),
});
