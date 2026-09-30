import { describe, expect, it, vi } from 'vitest';
import { FileAlertIssueUseCase } from '#src/use-cases/alerts/FileAlertIssueUseCase.js';
import { formatAlertIssue } from '#src/use-cases/alerts/formatAlertIssue.js';
import { ALERT_ISSUE } from '#src/use-cases/constants.js';
import { makeAlertNotification, makeIssueTracker } from '#src/__tests__/helpers/mocks/alerts.js';
import { makeRateLimiter } from '#src/__tests__/helpers/mocks/infrastructure.js';

const existing = { identifier: 'JEF-9', url: 'https://linear.app/t/JEF-9' };

describe('FileAlertIssueUseCase', () => {
  it('files an issue for a new open alert', async () => {
    const issueTracker = makeIssueTracker();
    const useCase = new FileAlertIssueUseCase({
      issueTracker,
      alertIssueRateLimiter: makeRateLimiter(),
    });
    const alert = makeAlertNotification();

    const result = await useCase.execute(alert);

    expect(result).toEqual({
      outcome: 'created',
      issue: { identifier: 'JEF-1', url: 'https://linear.app/t/JEF-1' },
    });
    expect(issueTracker.findOpenByFingerprint).toHaveBeenCalledWith(alert.fingerprint);
    expect(issueTracker.create).toHaveBeenCalledWith(formatAlertIssue(alert));
  });

  it('ignores a recovery without touching the tracker', async () => {
    const issueTracker = makeIssueTracker();
    const useCase = new FileAlertIssueUseCase({
      issueTracker,
      alertIssueRateLimiter: makeRateLimiter(),
    });

    const result = await useCase.execute(makeAlertNotification({ state: 'closed' }));

    expect(result).toEqual({ outcome: 'ignored_closed' });
    expect(issueTracker.findOpenByFingerprint).not.toHaveBeenCalled();
    expect(issueTracker.create).not.toHaveBeenCalled();
  });

  it('absorbs an alert whose fingerprint already has an open issue, without spending the rate limit', async () => {
    const issueTracker = makeIssueTracker({
      findOpenByFingerprint: vi.fn().mockResolvedValue(existing),
    });
    const alertIssueRateLimiter = makeRateLimiter();
    const useCase = new FileAlertIssueUseCase({ issueTracker, alertIssueRateLimiter });

    const result = await useCase.execute(makeAlertNotification());

    expect(result).toEqual({ outcome: 'duplicate', issue: existing });
    expect(issueTracker.create).not.toHaveBeenCalled();
    expect(alertIssueRateLimiter.consume).not.toHaveBeenCalled();
  });

  it('stops filing once the shared rate limit is spent', async () => {
    const issueTracker = makeIssueTracker();
    const alertIssueRateLimiter = makeRateLimiter({ consume: vi.fn().mockResolvedValue(false) });
    const useCase = new FileAlertIssueUseCase({ issueTracker, alertIssueRateLimiter });

    const result = await useCase.execute(makeAlertNotification());

    expect(result).toEqual({ outcome: 'rate_limited' });
    expect(alertIssueRateLimiter.consume).toHaveBeenCalledWith(ALERT_ISSUE.RATE_LIMIT_KEY);
    expect(issueTracker.create).not.toHaveBeenCalled();
  });

  it('lets a tracker failure propagate so the relay can answer 5xx', async () => {
    const issueTracker = makeIssueTracker({
      create: vi.fn().mockRejectedValue(new Error('Linear API request failed (500)')),
    });
    const useCase = new FileAlertIssueUseCase({
      issueTracker,
      alertIssueRateLimiter: makeRateLimiter(),
    });

    await expect(useCase.execute(makeAlertNotification())).rejects.toThrow('Linear API');
  });
});

describe('formatAlertIssue', () => {
  it('prefixes the source, lists facts and details, and ends with the fingerprint', () => {
    const issue = formatAlertIssue(
      makeAlertNotification({
        links: [{ label: 'Trace', url: 'https://example.com/t/1' }],
      }),
    );

    expect(issue.title).toBe('[Axiom] Use case failed: TypeError');
    expect(issue.fingerprint).toBe('axiom-mon1-0123456789abcdef');
    expect(issue.description).toContain('- **Release:** abc123');
    expect(issue.description).toContain('### Error\n\n```text\nTypeError: boom');
    expect(issue.description).toContain('- [Trace](https://example.com/t/1)');
    expect(issue.description.endsWith('Alert fingerprint: `axiom-mon1-0123456789abcdef`')).toBe(
      true,
    );
  });

  it('redacts Drizzle bound parameters from every field (JEF-348)', () => {
    const leaked =
      'Failed query: select * from "User" where "email" = $1\nparams: someone@example.com';
    const issue = formatAlertIssue(
      makeAlertNotification({
        title: leaked,
        summary: leaked,
        facts: [{ label: 'Message', value: leaked }],
        details: [
          { label: 'Error', language: 'text', content: `${leaked}\n    at run (a.ts:1:1)` },
        ],
      }),
    );

    expect(`${issue.title}\n${issue.description}`).not.toContain('someone@example.com');
    expect(issue.description).toContain('params: [redacted]');
  });

  it('keeps a detail containing a code fence inside its own block', () => {
    const issue = formatAlertIssue(
      makeAlertNotification({
        details: [{ label: 'Error', language: 'text', content: 'before ``` after' }],
      }),
    );

    expect(issue.description).toContain('````text\nbefore ``` after\n````');
  });

  it('caps the title and each detail block', () => {
    const issue = formatAlertIssue(
      makeAlertNotification({
        title: 'x'.repeat(1_000),
        details: [{ label: 'Error', language: 'text', content: 'y'.repeat(20_000) }],
      }),
    );

    expect(issue.title.length).toBeLessThanOrEqual(ALERT_ISSUE.MAX_TITLE_CHARS + 40);
    expect(issue.description).toContain('[truncated');
    expect(issue.description.length).toBeLessThan(ALERT_ISSUE.MAX_DETAIL_CHARS + 1_000);
  });
});
