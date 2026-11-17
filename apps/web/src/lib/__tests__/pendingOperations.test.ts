import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import {
  forgetPendingOperation,
  rememberPendingOperation,
  replayPendingOperations,
} from '#/lib/pendingOperations';

const STORAGE_KEY = 'trakwyn:pendingOperations';
const stored = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Array<{
    document: string;
    variables?: Record<string, unknown>;
  }>;

/** graphql-request shape: a `response` means the server answered. */
const graphqlError = (code: string) => ({
  response: { errors: [{ message: 'nope', extensions: { code } }] },
});

describe('pendingOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGqlRequest.mockResolvedValue({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('records an operation so it outlives the page that scheduled it', () => {
    rememberPendingOperation('mutation DeleteNote', { id: 'n1' });

    expect(stored()).toEqual([
      expect.objectContaining({ document: 'mutation DeleteNote', variables: { id: 'n1' } }),
    ]);
  });

  it('forgets one operation without disturbing the others', () => {
    const first = rememberPendingOperation('mutation A', { id: '1' });
    rememberPendingOperation('mutation B', { id: '2' });

    forgetPendingOperation(first);

    expect(stored().map((op) => op.document)).toEqual(['mutation B']);
  });

  it('sends what a previous page left behind', async () => {
    rememberPendingOperation('mutation DeleteNote', { id: 'n1' });

    await replayPendingOperations();

    expect(mockGqlRequest).toHaveBeenCalledWith('mutation DeleteNote', { id: 'n1' });
    expect(stored()).toEqual([]);
  });

  it('does nothing when there is nothing pending', async () => {
    await replayPendingOperations();

    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('drops an entry the server answered, even with an error', async () => {
    // NOT_FOUND is the expected case: an earlier attempt did land and the row
    // is already gone. Retrying it forever would be the real bug.
    rememberPendingOperation('mutation DeleteNote', { id: 'n1' });
    mockGqlRequest.mockRejectedValue(graphqlError('NOT_FOUND'));

    await replayPendingOperations();

    expect(stored()).toEqual([]);
  });

  it('keeps an entry that never reached the server', async () => {
    // Offline at startup postpones the delete rather than losing it a second
    // time — losing it is the whole bug this exists to fix.
    rememberPendingOperation('mutation DeleteNote', { id: 'n1' });
    mockGqlRequest.mockRejectedValue(new TypeError('Failed to fetch'));

    await replayPendingOperations();

    expect(stored()).toEqual([
      expect.objectContaining({ document: 'mutation DeleteNote', variables: { id: 'n1' } }),
    ]);
  });

  it('does not send the same delete twice when replay runs twice', async () => {
    rememberPendingOperation('mutation DeleteNote', { id: 'n1' });

    await Promise.all([replayPendingOperations(), replayPendingOperations()]);

    expect(mockGqlRequest).toHaveBeenCalledTimes(1);
  });

  it('survives corrupt storage instead of breaking every delete', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json{');

    expect(() => rememberPendingOperation('mutation A', { id: '1' })).not.toThrow();
    await expect(replayPendingOperations()).resolves.toBeUndefined();
  });
});
