/**
 * An alert from a monitoring source, already translated out of that source's
 * wire format (`interface-adapters/alerts/`), so the use case that files it
 * does not know Axiom from anything else (JEF-382).
 */
export interface AlertNotification {
  /** Where it came from, as a person would name it: `Axiom`. */
  source: string;
  /** Becomes the issue title. */
  title: string;
  /** What the alert means and what to do about it: the monitor's description. */
  summary: string;
  /** `closed` is a recovery; only `open` files an issue. */
  state: 'open' | 'closed';
  /** Same problem, same fingerprint — see `NewTrackedIssue.fingerprint`. */
  fingerprint: string;
  /** Short key/value lines: release, operation, value, window. */
  facts: ReadonlyArray<{ label: string; value: string }>;
  /** Long text shown verbatim in code blocks: stack traces, the matched event. */
  details: ReadonlyArray<{ label: string; language: string; content: string }>;
  links: ReadonlyArray<{ label: string; url: string }>;
}
