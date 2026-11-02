export interface JobPostingSource {
  text?: string | null;
  url?: string | null;
}

/** Fields read straight from a page's `schema.org/JobPosting` JSON-LD. */
export interface StructuredJobPosting {
  company: string | null;
  role: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
}

export interface ResolvedJobPosting {
  text: string;
  /**
   * True only for a page the server fetched from a public URL. Pasted text may
   * hold the user's own notes, so it is never shared between users (JEF-450).
   */
  fetchedFromUrl: boolean;
  /** JSON-LD fields found on a fetched page; `null` for pasted text or a page without any. */
  structured: StructuredJobPosting | null;
}

export interface IJobPostingSourceResolver {
  resolve(source: JobPostingSource): Promise<string>;
  /** Like `resolve`, but also says where the text came from and what structured data the page carried. */
  resolveDetailed(source: JobPostingSource): Promise<ResolvedJobPosting>;
}
