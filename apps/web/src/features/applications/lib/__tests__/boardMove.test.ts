import { describe, it, expect } from 'vitest';
import {
  compareBoardApplications,
  findColumnOf,
  groupByStatus,
  moveToColumn,
  resolveDragEnd,
  type BoardColumns,
} from '#/features/applications/lib/boardMove';
import type { BoardApplication } from '#/features/applications/graphql/boardQueries';

const STATUSES = ['applied', 'interviewing', 'offered'] as const;

const app = (overrides: Partial<BoardApplication> = {}): BoardApplication => ({
  id: 'app-1',
  company: 'Acme',
  role: 'Engineer',
  status: 'applied',
  location: null,
  appliedAt: null,
  starred: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  tags: [],
  likelyGhosted: false,
  boardPosition: 0,
  ...overrides,
});

describe('compareBoardApplications', () => {
  it('orders by boardPosition ascending', () => {
    const sorted = [
      app({ id: 'c', boardPosition: 2 }),
      app({ id: 'a', boardPosition: 0 }),
      app({ id: 'b', boardPosition: 1 }),
    ].sort(compareBoardApplications);

    expect(sorted.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to newest-first when positions tie', () => {
    // Every row ties at 0 until something is dragged, so this fallback is what
    // reproduces the board's original order with no backfill migration.
    const sorted = [
      app({ id: 'older', boardPosition: 0, createdAt: '2024-01-01T00:00:00.000Z' }),
      app({ id: 'newer', boardPosition: 0, createdAt: '2024-06-01T00:00:00.000Z' }),
    ].sort(compareBoardApplications);

    expect(sorted.map((a) => a.id)).toEqual(['newer', 'older']);
  });

  it('breaks a full tie on id so the order is never unstable', () => {
    const sorted = [app({ id: 'a', boardPosition: 0 }), app({ id: 'b', boardPosition: 0 })].sort(
      compareBoardApplications,
    );

    expect(sorted.map((a) => a.id)).toEqual(['b', 'a']);
  });
});

describe('groupByStatus', () => {
  it('buckets ids by status, each column in board order', () => {
    const columns = groupByStatus(
      [
        app({ id: 'a2', status: 'applied', boardPosition: 1 }),
        app({ id: 'a1', status: 'applied', boardPosition: 0 }),
        app({ id: 'i1', status: 'interviewing', boardPosition: 0 }),
      ],
      STATUSES,
    );

    expect(columns).toEqual({ applied: ['a1', 'a2'], interviewing: ['i1'], offered: [] });
  });

  it('keeps a column for every status, even empty ones', () => {
    expect(Object.keys(groupByStatus([], STATUSES))).toEqual([...STATUSES]);
  });

  it('ignores an application whose status is not a board column', () => {
    const columns = groupByStatus([app({ id: 'x', status: 'withdrawn' })], STATUSES);
    expect(Object.values(columns).flat()).toEqual([]);
  });
});

describe('findColumnOf', () => {
  const columns: BoardColumns = { applied: ['a1'], interviewing: [], offered: [] };

  it('finds the column holding a card', () => {
    expect(findColumnOf(columns, 'a1')).toBe('applied');
  });

  it("resolves a column's own id to itself, which is how an empty column is a target", () => {
    expect(findColumnOf(columns, 'interviewing')).toBe('interviewing');
  });

  it('returns null for an unknown id', () => {
    expect(findColumnOf(columns, 'nope')).toBeNull();
  });
});

describe('moveToColumn', () => {
  it('inserts the card at the position of the card it is over', () => {
    const columns: BoardColumns = { applied: ['a1'], interviewing: ['i1', 'i2'], offered: [] };

    expect(moveToColumn(columns, 'a1', 'i2')).toEqual({
      applied: [],
      interviewing: ['i1', 'a1', 'i2'],
      offered: [],
    });
  });

  it('appends when dropped on the column itself', () => {
    const columns: BoardColumns = { applied: ['a1'], interviewing: ['i1'], offered: [] };

    expect(moveToColumn(columns, 'a1', 'interviewing')).toEqual({
      applied: [],
      interviewing: ['i1', 'a1'],
      offered: [],
    });
  });

  it('moves into an empty column', () => {
    const columns: BoardColumns = { applied: ['a1'], interviewing: [], offered: [] };

    expect(moveToColumn(columns, 'a1', 'offered')).toEqual({
      applied: [],
      interviewing: [],
      offered: ['a1'],
    });
  });

  it('is a no-op within one column', () => {
    const columns: BoardColumns = { applied: ['a1', 'a2'], interviewing: [], offered: [] };
    expect(moveToColumn(columns, 'a1', 'a2')).toBe(columns);
  });
});

describe('resolveDragEnd', () => {
  const before: BoardColumns = {
    applied: ['a1', 'a2', 'a3'],
    interviewing: ['i1'],
    offered: [],
  };

  it('reorders within a column and reports that column in its new order', () => {
    const move = resolveDragEnd(before, before, 'a3', 'a1');

    expect(move).toEqual({
      columns: { applied: ['a3', 'a1', 'a2'], interviewing: ['i1'], offered: [] },
      toStatus: 'applied',
      orderedIds: ['a3', 'a1', 'a2'],
    });
  });

  it('moves across columns and reports the destination', () => {
    const move = resolveDragEnd(before, before, 'a1', 'i1');

    expect(move?.toStatus).toBe('interviewing');
    expect(move?.orderedIds).toEqual(['a1', 'i1']);
  });

  it('handles a drop on an empty column', () => {
    const move = resolveDragEnd(before, before, 'a1', 'offered');

    expect(move?.toStatus).toBe('offered');
    expect(move?.orderedIds).toEqual(['a1']);
  });

  it('returns null when a card is picked up and put back', () => {
    expect(resolveDragEnd(before, before, 'a2', 'a2')).toBeNull();
  });

  it('still reports a cross-column move the in-flight preview already applied', () => {
    // onDragOver moves the card as the pointer travels, so by the time the
    // drop lands the live board already shows it in the new column. Comparing
    // against the pre-drag snapshot is what keeps this from reading as
    // "nothing changed" and silently skipping the mutation.
    const live: BoardColumns = { applied: ['a2', 'a3'], interviewing: ['a1', 'i1'], offered: [] };

    const move = resolveDragEnd(live, before, 'a1', 'a1');

    expect(move?.toStatus).toBe('interviewing');
    expect(move?.orderedIds).toEqual(['a1', 'i1']);
  });

  it('returns null for an unknown active id', () => {
    expect(resolveDragEnd(before, before, 'ghost', 'a1')).toBeNull();
  });

  it('returns null for an unknown drop target', () => {
    expect(resolveDragEnd(before, before, 'a1', 'ghost')).toBeNull();
  });
});
