/**
 * What one job posting asks for, read out of its text once and kept with the
 * application (JEF-593). A resume is tailored against this list, so the same
 * requirements are addressed every time instead of whichever ones the model
 * happened to notice in the raw posting.
 *
 * One per application, replaced when the posting changes.
 */
export interface PostingRequirements {
  id: string;
  applicationId: string;
  /** What the posting says a candidate must have, in the posting's own words. */
  mustHave: string[];
  /** What it calls a plus, preferred or nice to have. */
  niceToHave: string[];
  /** The skills, tools and terms a screener would search a resume for, spelled as the posting spells them. */
  keywords: string[];
  /** The level the posting names ("Senior", "Staff", "Entry level"); null when it names none. */
  seniority: string | null;
  /** Hash of the posting text these were read from; see `hashJobDescription`. */
  postingHash: string;
  /** The `postingRequirementsPrompt` version that produced them. */
  promptVersion: number;
  generatedAt: Date;
}
