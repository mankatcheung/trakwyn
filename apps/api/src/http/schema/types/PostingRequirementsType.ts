import { builder } from '#src/http/schema/builder.js';
import type { PostingRequirementsView } from '#src/use-cases/postingRequirements/postingRequirementsView.js';

export const PostingRequirementsRef =
  builder.objectRef<PostingRequirementsView>('PostingRequirements');
PostingRequirementsRef.implement({
  description: 'What an application’s job posting asks for, read from its text by AI.',
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    mustHave: t.exposeStringList('mustHave'),
    niceToHave: t.exposeStringList('niceToHave'),
    keywords: t.exposeStringList('keywords'),
    seniority: t.exposeString('seniority', { nullable: true }),
    generatedAt: t.string({ resolve: (requirements) => requirements.generatedAt.toISOString() }),
    // True when the posting was edited after these were read.
    isStale: t.exposeBoolean('isStale'),
  }),
});
