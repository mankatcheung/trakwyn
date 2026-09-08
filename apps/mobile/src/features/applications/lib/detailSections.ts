/** Sub-screens reachable from the application detail pill tab bar, keyed by their relative route. */
export const DETAIL_SECTION_ROUTES = {
  notes: './notes',
  interviews: './interviews',
  documents: './documents',
} as const;

export type DetailSectionKey = keyof typeof DETAIL_SECTION_ROUTES;

/**
 * The full set of application sections, grouped the way web's `-sections.ts`
 * groups them (Track / Documents / Outcome), used to render the detail
 * screen's section index list (JEF-303).
 *
 * A flat tab bar stopped scaling once Contacts, Cover Letter, Resume Match,
 * Company Briefing and Offers joined Notes/Interviews/Documents — nine items
 * in one row (or even a scrolling one) reads as a wall of text on a phone.
 * Grouping into a short scrollable list, mirroring web's sidebar/index
 * grouping, keeps each destination discoverable without the horizontal noise.
 *
 * `slug` is the sub-route's filename under `[id]/` — the detail screen (the
 * `[id]/index` route) must build `./${applicationId}/${slug}` itself rather
 * than pushing `slug` directly, since a bare relative push from an index
 * route resolves against the parent of `[id]` and drops the id from the URL.
 */
export interface DetailSectionDef {
  key: string;
  slug: string;
  labelKey: string;
}

export interface DetailSectionGroup {
  titleKey: string;
  sections: DetailSectionDef[];
}

export const DETAIL_SECTION_GROUPS: DetailSectionGroup[] = [
  {
    titleKey: 'detail.groupTrack',
    sections: [
      { key: 'notes', slug: 'notes', labelKey: 'detail.notesTab' },
      { key: 'interviews', slug: 'interviews', labelKey: 'detail.interviewsTab' },
      { key: 'contacts', slug: 'contacts', labelKey: 'detail.contactsTab' },
      { key: 'activity', slug: 'activity', labelKey: 'detail.activityTab' },
    ],
  },
  {
    titleKey: 'detail.groupDocuments',
    sections: [
      { key: 'documents', slug: 'documents', labelKey: 'detail.docsTab' },
      { key: 'coverLetter', slug: 'cover-letter', labelKey: 'detail.coverLetterTab' },
      { key: 'resumeMatch', slug: 'resume-match', labelKey: 'detail.resumeMatchTab' },
      { key: 'companyBriefing', slug: 'company-briefing', labelKey: 'detail.companyBriefingTab' },
    ],
  },
  {
    titleKey: 'detail.groupOutcome',
    sections: [{ key: 'offers', slug: 'offers', labelKey: 'detail.offersTab' }],
  },
];
