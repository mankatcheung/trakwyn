import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

const { mockGqlRequest, mockToast } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    mockGqlRequest: vi.fn(),
    mockToast: Object.assign(toastFn, {
      success: vi.fn(),
      error: vi.fn(),
      dismiss: vi.fn(),
    }),
  };
});

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('sonner', () => ({ toast: mockToast }));

import {
  deleteApplicationWithUndo,
  deleteApplicationsWithUndo,
} from '#/features/applications/lib/deleteWithUndo';
import { gqlText, gqlContaining } from '#/__tests__/helpers/gqlText';

/** The Undo handler the helper installed on the toast it raised. */
function capturedUndo(): () => void {
  const [, options] = mockToast.mock.calls.at(-1) as [string, { action: { onClick: () => void } }];
  return options.action.onClick;
}

const queriesFor = (fragment: string) =>
  mockGqlRequest.mock.calls.filter(([query]) => gqlText(query).includes(fragment));

describe('deleteApplicationWithUndo', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGqlRequest.mockResolvedValue({});
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the delete without waiting out an undo window', async () => {
    deleteApplicationWithUndo(qc, 'app-1', 'Deleted');

    // No timers advanced. This is the whole point of JEF-190: if the request
    // is ever put back behind a setTimeout, this assertion fails.
    await vi.waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('deleteApplication'), {
        id: 'app-1',
      }),
    );
  });

  it('runs onDeleted synchronously, so the caller can leave the page at once', () => {
    const onDeleted = vi.fn();
    deleteApplicationWithUndo(qc, 'app-1', 'Deleted', onDeleted);

    // Not awaited, not deferred — called before the request can possibly resolve.
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('undo restores the application rather than cancelling anything', async () => {
    deleteApplicationWithUndo(qc, 'app-1', 'Deleted');
    await vi.waitFor(() => expect(queriesFor('deleteApplication')).toHaveLength(1));

    capturedUndo()();

    await vi.waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RestoreApplication'), {
        id: 'app-1',
      }),
    );
    // The delete is not retracted — it already happened, and restore reverses it.
    expect(queriesFor('deleteApplication')).toHaveLength(1);
  });

  it('reports a failed delete instead of leaving the UI claiming success', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network down'));

    deleteApplicationWithUndo(qc, 'app-1', 'Deleted');

    await vi.waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it('reports a failed undo', async () => {
    deleteApplicationWithUndo(qc, 'app-1', 'Deleted');
    await vi.waitFor(() => expect(queriesFor('deleteApplication')).toHaveLength(1));

    mockGqlRequest.mockRejectedValue(new Error('nope'));
    capturedUndo()();

    await vi.waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});

describe('deleteApplicationsWithUndo', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGqlRequest.mockResolvedValue({});
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes every id immediately', async () => {
    deleteApplicationsWithUndo(qc, ['a', 'b'], 'Deleted 2');

    await vi.waitFor(() => expect(queriesFor('deleteApplication')).toHaveLength(2));
  });

  it('undo restores the batch in one call and puts the optimistic rows back', async () => {
    const onUndoOptimistic = vi.fn();
    deleteApplicationsWithUndo(qc, ['a', 'b'], 'Deleted 2', onUndoOptimistic);
    await vi.waitFor(() => expect(queriesFor('deleteApplication')).toHaveLength(2));

    capturedUndo()();

    expect(onUndoOptimistic).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('BulkRestoreApplications'), {
        ids: ['a', 'b'],
      }),
    );
  });

  it('uses the single-restore mutation for a batch of one', async () => {
    deleteApplicationsWithUndo(qc, ['only'], 'Deleted 1');
    await vi.waitFor(() => expect(queriesFor('deleteApplication')).toHaveLength(1));

    capturedUndo()();

    await vi.waitFor(() => expect(queriesFor('RestoreApplication')).not.toHaveLength(0));
    expect(queriesFor('BulkRestoreApplications')).toHaveLength(0);
  });
});
