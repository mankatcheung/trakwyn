import { describe, expect, it, vi } from 'vitest';
import { LinearIssueTracker } from '#src/infrastructure/issueTracker/LinearIssueTracker.js';
import { LINEAR } from '#src/infrastructure/config/constants.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function trackerWith(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  const tracker = new LinearIssueTracker({ apiKey: 'lin_api_key', teamId: 'team-uuid', fetch });
  return { tracker, fetch };
}

function sentBody(fetch: ReturnType<typeof vi.fn>) {
  const [, init] = fetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
}

describe('LinearIssueTracker', () => {
  it('searches open issues in the team by fingerprint, with the key as a bare Authorization header', async () => {
    const { tracker, fetch } = trackerWith(
      jsonResponse({ data: { issues: { nodes: [{ identifier: 'JEF-9', url: 'u' }] } } }),
    );

    await expect(tracker.findOpenByFingerprint('axiom-m-1')).resolves.toEqual({
      identifier: 'JEF-9',
      url: 'u',
    });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(LINEAR.API_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('lin_api_key');
    const body = sentBody(fetch);
    expect(body.variables).toEqual({ teamId: 'team-uuid', fingerprint: 'axiom-m-1' });
    expect(body.query).toContain('nin: ["completed", "canceled"]');
  });

  it('returns null when no open issue matches', async () => {
    const { tracker } = trackerWith(jsonResponse({ data: { issues: { nodes: [] } } }));

    await expect(tracker.findOpenByFingerprint('axiom-m-1')).resolves.toBeNull();
  });

  it('creates an issue with title and description passed as variables', async () => {
    const { tracker, fetch } = trackerWith(
      jsonResponse({
        data: { issueCreate: { success: true, issue: { identifier: 'JEF-10', url: 'u10' } } },
      }),
    );
    const description = 'a "quoted" } { description';

    await expect(tracker.create({ title: 'T', description, fingerprint: 'f' })).resolves.toEqual({
      identifier: 'JEF-10',
      url: 'u10',
    });

    const body = sentBody(fetch);
    expect(body.variables).toEqual({ input: { teamId: 'team-uuid', title: 'T', description } });
    expect(body.query).not.toContain(description);
  });

  it('throws with the status and Linear error message on failure', async () => {
    const { tracker } = trackerWith(
      jsonResponse({ errors: [{ message: 'Authentication required' }] }, 401),
    );

    await expect(tracker.findOpenByFingerprint('f')).rejects.toThrow(
      'Linear API request failed (401): Authentication required',
    );
  });

  it('throws on a GraphQL error inside a 200', async () => {
    const { tracker } = trackerWith(
      jsonResponse({ data: null, errors: [{ message: 'bad input' }] }),
    );

    await expect(
      tracker.create({ title: 'T', description: 'd', fingerprint: 'f' }),
    ).rejects.toThrow('bad input');
  });

  it('throws when issueCreate reports no success', async () => {
    const { tracker } = trackerWith(
      jsonResponse({ data: { issueCreate: { success: false, issue: null } } }),
    );

    await expect(
      tracker.create({ title: 'T', description: 'd', fingerprint: 'f' }),
    ).rejects.toThrow('no issue');
  });
});
