import { z } from 'zod';
import {
  ActivityIcon,
  Building2Icon,
  CalendarIcon,
  DollarSignIcon,
  FileTextIcon,
  FileUserIcon,
  PenLineIcon,
  UploadIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * The nine sections of an application, grouped as the detail page presents
 * them, in one place.
 *
 * The index, the desktop sidebar and the `?section=` URL schema all read this,
 * so a section cannot exist in the navigation and not in the URL — or be
 * grouped one way in the list and another in the sidebar.
 *
 * Ids are kebab-case, not display-ish strings with spaces: they are URL
 * query-param values.
 */
export const SECTION_IDS = [
  'notes',
  'interviews',
  'contacts',
  'activity',
  'company-briefing',
  'resumes',
  'cover-letters',
  'other-documents',
  'offers',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/**
 * Section ids that no longer exist, so a saved link or a back-button entry
 * still opens somewhere sensible. `documents` held everything before JEF-396
 * split it in three; Resumes is the closest single home for it. `resume-match`
 * became a per-resume panel inside Resumes (JEF-397).
 */
export const LEGACY_SECTION_IDS: Record<string, SectionId> = {
  documents: 'resumes',
  'cover-letter': 'cover-letters',
  'resume-match': 'resumes',
};

const resolveLegacySection = (value: unknown): unknown =>
  typeof value === 'string' && Object.hasOwn(LEGACY_SECTION_IDS, value)
    ? LEGACY_SECTION_IDS[value]
    : value;

/** Unknown or absent falls back to Notes rather than erroring the route. */
export const sectionSearchSchema = z.object({
  section: z.preprocess(resolveLegacySection, z.enum(SECTION_IDS).optional()),
});

/** What the API's `sectionCounts` returns. */
export interface ApiSectionCounts {
  notes: number;
  interviews: number;
  contacts: number;
  offers: number;
}

/**
 * Derived on the client from the documents and drafts lists, because the API
 * counts only totals and a tab's badge has to count its own category.
 */
export interface DocumentSectionCounts {
  coverLetters: number;
  resumes: number;
  otherDocuments: number;
}

export type SectionCounts = ApiSectionCounts & DocumentSectionCounts;

export interface SectionDef {
  id: SectionId;
  labelKey: string;
  icon: LucideIcon;
  /**
   * Which count decides whether this section reads as empty. Sections without
   * one (activity, company briefing) are never dimmed — they
   * hold generated or derived content, not a list the user has filled.
   */
  countOf?: (counts: SectionCounts) => number;
}

export interface SectionGroup {
  titleKey: string;
  sections: SectionDef[];
}

export const SECTION_GROUPS: SectionGroup[] = [
  {
    titleKey: 'applicationDetail.groupTrack',
    sections: [
      {
        id: 'notes',
        labelKey: 'applicationDetail.tabNotes',
        icon: FileTextIcon,
        countOf: (c) => c.notes,
      },
      {
        id: 'interviews',
        labelKey: 'applicationDetail.tabInterviews',
        icon: CalendarIcon,
        countOf: (c) => c.interviews,
      },
      {
        id: 'contacts',
        labelKey: 'applicationDetail.tabContacts',
        icon: UsersIcon,
        countOf: (c) => c.contacts,
      },
      { id: 'activity', labelKey: 'applicationDetail.tabActivity', icon: ActivityIcon },
    ],
  },
  {
    titleKey: 'applicationDetail.groupDocuments',
    sections: [
      {
        id: 'company-briefing',
        labelKey: 'applicationDetail.tabCompanyBriefing',
        icon: Building2Icon,
      },
      {
        id: 'resumes',
        labelKey: 'applicationDetail.tabResumes',
        icon: FileUserIcon,
        countOf: (c) => c.resumes,
      },
      {
        id: 'cover-letters',
        labelKey: 'applicationDetail.tabCoverLetters',
        icon: PenLineIcon,
        countOf: (c) => c.coverLetters,
      },
      {
        id: 'other-documents',
        labelKey: 'applicationDetail.tabOtherDocuments',
        icon: UploadIcon,
        countOf: (c) => c.otherDocuments,
      },
    ],
  },
  {
    titleKey: 'applicationDetail.groupOutcome',
    sections: [
      {
        id: 'offers',
        labelKey: 'applicationDetail.tabOffers',
        icon: DollarSignIcon,
        countOf: (c) => c.offers,
      },
    ],
  },
];

export const ALL_SECTIONS: SectionDef[] = SECTION_GROUPS.flatMap((g) => g.sections);

export function sectionById(id: SectionId): SectionDef {
  return ALL_SECTIONS.find((s) => s.id === id) ?? ALL_SECTIONS[0];
}
