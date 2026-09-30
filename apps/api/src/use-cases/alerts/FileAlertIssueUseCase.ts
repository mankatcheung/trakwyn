import { ALERT_ISSUE } from '#src/use-cases/constants.js';
import type { IIssueTracker, TrackedIssue } from '#src/use-cases/ports/IIssueTracker.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

import type { AlertNotification } from './alertNotification.js';
import { formatAlertIssue } from './formatAlertIssue.js';

export type FileAlertIssueResult =
  /** A recovery notification: nothing to file. */
  | { outcome: 'ignored_closed' }
  /** Past `RATE_LIMIT.ALERT_ISSUE`: an alert storm is one incident, not fifty issues. */
  | { outcome: 'rate_limited' }
  /** An open issue already has this fingerprint. */
  | { outcome: 'duplicate'; issue: TrackedIssue }
  | { outcome: 'created'; issue: TrackedIssue };

interface Deps {
  issueTracker: IIssueTracker;
  alertIssueRateLimiter: IRateLimiter;
}

/**
 * Files one tracker issue per distinct open problem an alert reports (JEF-382).
 *
 * A match monitor fires once per matching event, so the same fault on every
 * request would otherwise open an issue per request. The fingerprint is the
 * dedupe: while an issue carrying it is still open, later alerts for it are
 * absorbed. Once that issue is closed, the next alert files a fresh one —
 * which is what a regression should do.
 *
 * Failures of the tracker itself propagate: the route answers 5xx, and the
 * alert's source retries or at least records the failed delivery.
 */
export class FileAlertIssueUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(alert: AlertNotification): Promise<FileAlertIssueResult> {
    if (alert.state === 'closed') return { outcome: 'ignored_closed' };

    // Checked before the rate limit, so a burst of the same alert does not
    // use up the budget a different, new problem needs.
    const existing = await this.deps.issueTracker.findOpenByFingerprint(alert.fingerprint);
    if (existing) return { outcome: 'duplicate', issue: existing };

    if (!(await this.deps.alertIssueRateLimiter.consume(ALERT_ISSUE.RATE_LIMIT_KEY))) {
      return { outcome: 'rate_limited' };
    }

    const issue = await this.deps.issueTracker.create(formatAlertIssue(alert));
    return { outcome: 'created', issue };
  }
}
