import type { SectionCounts } from './sectionCounts';

/** Sub-screens reachable from the application detail pill tab bar, keyed by their relative route. */
export const DETAIL_SECTION_ROUTES = {
  notes: './notes',
  interviews: './interviews',
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
  /** The badge for a section that holds a list; zero reads as no badge, as on web. */
  countOf?: (counts: SectionCounts) => number;
  /** For a section holding one generated item: whether it exists yet (check or dot). */
  generatedOf?: (counts: SectionCounts) => boolean;
}

export interface DetailSectionGroup {
  titleKey: string;
  sections: DetailSectionDef[];
}

export const DETAIL_SECTION_GROUPS: DetailSectionGroup[] = [
  {
    titleKey: 'detail.groupTrack',
    sections: [
      { key: 'notes', slug: 'notes', labelKey: 'detail.notesTab', countOf: (c) => c.notes },
      {
        key: 'interviews',
        slug: 'interviews',
        labelKey: 'detail.interviewsTab',
        countOf: (c) => c.interviews,
      },
      {
        key: 'contacts',
        slug: 'contacts',
        labelKey: 'detail.contactsTab',
        countOf: (c) => c.contacts,
      },
      { key: 'activity', slug: 'activity', labelKey: 'detail.activityTab' },
    ],
  },
  {
    titleKey: 'detail.groupDocuments',
    sections: [
      {
        key: 'companyBriefing',
        slug: 'company-briefing',
        labelKey: 'detail.companyBriefingTab',
        generatedOf: (c) => c.companyBriefing,
      },
      {
        key: 'resumes',
        slug: 'resumes',
        labelKey: 'detail.resumesTab',
        countOf: (c) => c.resumes,
      },
      {
        key: 'coverLetters',
        slug: 'cover-letters',
        labelKey: 'detail.coverLettersTab',
        countOf: (c) => c.coverLetters,
      },
      {
        key: 'otherDocuments',
        slug: 'other-documents',
        labelKey: 'detail.otherDocumentsTab',
        countOf: (c) => c.otherDocuments,
      },
      { key: 'resumeMatch', slug: 'resume-match', labelKey: 'detail.resumeMatchTab' },
    ],
  },
  {
    titleKey: 'detail.groupOutcome',
    sections: [
      { key: 'offers', slug: 'offers', labelKey: 'detail.offersTab', countOf: (c) => c.offers },
    ],
  },
];
