/**
 * Test doubles for the alerts domain (JEF-382).
 */

import { vi } from 'vitest';
import type { AlertNotification } from '#src/use-cases/alerts/alertNotification.js';
import type { IIssueTracker } from '#src/use-cases/ports/IIssueTracker.js';

/** No open issue, and every create succeeds as `JEF-1`. */
export const makeIssueTracker = (overrides?: Partial<IIssueTracker>): IIssueTracker => ({
  findOpenByFingerprint: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({ identifier: 'JEF-1', url: 'https://linear.app/t/JEF-1' }),
  ...overrides,
});

export const makeAlertNotification = (
  overrides?: Partial<AlertNotification>,
): AlertNotification => ({
  source: 'Axiom',
  title: 'Use case failed: TypeError',
  summary: 'A use case threw something that was not a DomainError.',
  state: 'open',
  fingerprint: 'axiom-mon1-0123456789abcdef',
  facts: [{ label: 'Release', value: 'abc123' }],
  details: [
    { label: 'Error', language: 'text', content: 'TypeError: boom\n    at run (a.ts:1:1)' },
  ],
  links: [],
  ...overrides,
});
