import { builder } from '#src/http/schema/builder.js';
import type { ApplicationSectionCounts } from '#src/use-cases/jobs/GetApplicationSectionCountsUseCase.js';

/**
 * How much sits in each section of an application. Every field is present
 * even at zero — the detail page's index dims empty sections rather than
 * hiding them, so it needs the number, not its absence (JEF-208).
 */
export const ApplicationSectionCountsRef = builder.objectRef<ApplicationSectionCounts>(
  'ApplicationSectionCounts',
);
ApplicationSectionCountsRef.implement({
  fields: (t) => ({
    notes: t.exposeInt('notes'),
    interviews: t.exposeInt('interviews'),
    contacts: t.exposeInt('contacts'),
    documents: t.exposeInt('documents'),
    documentDrafts: t.exposeInt('documentDrafts'),
    offers: t.exposeInt('offers'),
    companyBriefing: t.exposeBoolean('companyBriefing'),
  }),
});
