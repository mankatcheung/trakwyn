/** An issue the tracker already holds, as much of it as a caller needs to point at it. */
export interface TrackedIssue {
  /** Human-facing key, e.g. `JEF-382`. */
  identifier: string;
  url: string;
}

export interface NewTrackedIssue {
  title: string;
  /** Markdown. */
  description: string;
  /**
   * Stable key for "the same problem again". Written into the issue so a
   * later alert can find it with `findOpenByFingerprint` — the tracker is the
   * only store, so dedupe survives restarts and scales across instances.
   */
  fingerprint: string;
}

/**
 * Where operational alerts become work items (JEF-382). Linear in production;
 * the port keeps `FileAlertIssueUseCase` ignorant of which.
 */
export interface IIssueTracker {
  /** An issue with this fingerprint that is not completed or cancelled, if any. */
  findOpenByFingerprint(fingerprint: string): Promise<TrackedIssue | null>;
  create(issue: NewTrackedIssue): Promise<TrackedIssue>;
}
