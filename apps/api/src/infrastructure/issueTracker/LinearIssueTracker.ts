import { LINEAR, PROVIDER_ERROR_BODY_MAX_CHARS } from '#src/infrastructure/config/constants.js';
import type {
  IIssueTracker,
  NewTrackedIssue,
  TrackedIssue,
} from '#src/use-cases/ports/IIssueTracker.js';

export interface LinearIssueTrackerOptions {
  apiKey: string;
  teamId: string;
  /** Injected in tests; the global `fetch` otherwise. */
  fetch?: typeof fetch;
}

/**
 * "Open" is any state Linear does not call done: triage, backlog, unstarted
 * and started. An issue someone completed or cancelled no longer absorbs new
 * alerts, so a regression files a fresh one.
 */
const FIND_OPEN_BY_FINGERPRINT = `
  query FindOpenAlertIssue($teamId: ID!, $fingerprint: String!) {
    issues(
      first: 1
      filter: {
        team: { id: { eq: $teamId } }
        description: { contains: $fingerprint }
        state: { type: { nin: ["completed", "canceled"] } }
      }
    ) {
      nodes { identifier url }
    }
  }
`;

const CREATE_ISSUE = `
  mutation CreateAlertIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { identifier url }
    }
  }
`;

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: ReadonlyArray<{ message?: string }>;
}

/**
 * Files alert issues in Linear through its GraphQL API (JEF-382).
 *
 * Variables, never string interpolation: the title and description carry
 * exception messages and stack traces, which are arbitrary text.
 *
 * A failure throws with the HTTP status and Linear's first error message,
 * cut to `PROVIDER_ERROR_BODY_MAX_CHARS` — never the request, which holds the
 * alert's contents.
 */
export class LinearIssueTracker implements IIssueTracker {
  private readonly apiKey: string;
  private readonly teamId: string;
  private readonly fetch: typeof fetch;

  constructor(options: LinearIssueTrackerOptions) {
    this.apiKey = options.apiKey;
    this.teamId = options.teamId;
    this.fetch = options.fetch ?? fetch;
  }

  async findOpenByFingerprint(fingerprint: string): Promise<TrackedIssue | null> {
    const data = await this.request<{ issues: { nodes: TrackedIssue[] } }>(
      FIND_OPEN_BY_FINGERPRINT,
      { teamId: this.teamId, fingerprint },
    );
    return data.issues.nodes[0] ?? null;
  }

  async create({ title, description }: NewTrackedIssue): Promise<TrackedIssue> {
    const data = await this.request<{
      issueCreate: { success: boolean; issue: TrackedIssue | null };
    }>(CREATE_ISSUE, { input: { teamId: this.teamId, title, description } });

    const { success, issue } = data.issueCreate;
    if (!success || !issue) throw new Error('Linear issueCreate reported no issue');
    return issue;
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await this.fetch(LINEAR.API_URL, {
      method: 'POST',
      headers: {
        // A personal API key goes in bare; `Bearer` is for OAuth tokens.
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(LINEAR.REQUEST_TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as GraphQLResponse<T> | null;
    const firstError = body?.errors?.[0]?.message;

    if (!response.ok || firstError || !body?.data) {
      const detail = (firstError ?? 'no data').slice(0, PROVIDER_ERROR_BODY_MAX_CHARS);
      throw new Error(`Linear API request failed (${response.status}): ${detail}`);
    }
    return body.data;
  }
}
