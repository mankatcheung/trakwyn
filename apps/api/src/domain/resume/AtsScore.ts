/** One rule an applicant tracking system's parser cares about. */
export interface AtsCheck {
  /** Stable key, so a client can attach its own copy or icon to a check. */
  id: string;
  label: string;
  passed: boolean;
  /** Points earned: `maxPoints` when passed, 0 otherwise. */
  points: number;
  maxPoints: number;
  /** How to fix it when the check fails. */
  hint: string;
}

export interface AtsScoreResult {
  /** 0-100. */
  score: number;
  label: string;
  /**
   * False when no usable text came out of the resume (a scan or an image):
   * the score is then 0 and `checks` holds only the failed extraction check,
   * since nothing else can be judged.
   */
  readable: boolean;
  checks: AtsCheck[];
}
