import { arrayMove } from '@dnd-kit/sortable';
import type { BoardApplication } from '../graphql/boardQueries';

/**
 * The board reduced to what a drag actually operates on: card ids, keyed by
 * the status column holding them, each column in display order.
 *
 * dnd-kit drags cannot be meaningfully simulated in jsdom, so every decision a
 * drag makes lives here as a plain function over plain data. The component
 * below is a shell that feeds these and renders the result.
 */
export type BoardColumns = Record<string, string[]>;

export interface BoardMove {
  /** The board as it reads after the drop. */
  columns: BoardColumns;
  /** The column the card ended up in. */
  toStatus: string;
  /** That column in full, in its new order. */
  orderedIds: string[];
}

/**
 * Board order: rank first, then newest. Every row ties at rank 0 until
 * something is dragged, so before that the tiebreak alone reproduces the
 * order the board had before ranks existed — and a newly created application
 * still sorts to the top of its column.
 */
export function compareBoardApplications(a: BoardApplication, b: BoardApplication): number {
  if (a.boardPosition !== b.boardPosition) return a.boardPosition - b.boardPosition;
  const byCreated = b.createdAt.localeCompare(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

export function groupByStatus(apps: BoardApplication[], statuses: readonly string[]): BoardColumns {
  const columns: BoardColumns = Object.fromEntries(statuses.map((status) => [status, []]));
  for (const app of [...apps].sort(compareBoardApplications)) {
    columns[app.status]?.push(app.id);
  }
  return columns;
}

/**
 * Which column an id belongs to. A column's own id resolves to itself, which
 * is what makes an empty column a valid drop target — there is no card there
 * to point at.
 */
export function findColumnOf(columns: BoardColumns, id: string): string | null {
  if (id in columns) return id;
  return Object.keys(columns).find((status) => columns[status].includes(id)) ?? null;
}

/**
 * Move a card into the column `overId` points at, at that position. Used while
 * the drag is still in flight so the card previews where it would land.
 */
export function moveToColumn(
  columns: BoardColumns,
  activeId: string,
  overId: string,
): BoardColumns {
  const from = findColumnOf(columns, activeId);
  const to = findColumnOf(columns, overId);
  if (!from || !to || from === to) return columns;

  const target = columns[to];
  const overIndex = target.indexOf(overId);
  const insertAt = overIndex === -1 ? target.length : overIndex;

  return {
    ...columns,
    [from]: columns[from].filter((id) => id !== activeId),
    [to]: [...target.slice(0, insertAt), activeId, ...target.slice(insertAt)],
  };
}

const sameOrder = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Settle a drop.
 *
 * `columns` is the live board, which may already have the card in its new
 * column because the in-flight preview put it there; `before` is the snapshot
 * taken when the drag started. Comparing against `before` is what tells a real
 * move from a card picked up and put back — checking the live board alone
 * would read an already-previewed cross-column move as "nothing changed".
 *
 * Returns null when nothing moved, so the caller can skip the mutation.
 */
export function resolveDragEnd(
  columns: BoardColumns,
  before: BoardColumns,
  activeId: string,
  overId: string,
): BoardMove | null {
  const fromStatus = findColumnOf(before, activeId);
  const from = findColumnOf(columns, activeId);
  const to = findColumnOf(columns, overId);
  if (!fromStatus || !from || !to) return null;

  let next: BoardColumns;
  if (from === to) {
    const items = columns[from];
    const oldIndex = items.indexOf(activeId);
    // Dropping on the column itself rather than a card means the very end.
    const newIndex = overId === to ? items.length - 1 : items.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return null;
    next =
      oldIndex === newIndex
        ? columns
        : { ...columns, [from]: arrayMove(items, oldIndex, newIndex) };
  } else {
    next = moveToColumn(columns, activeId, overId);
  }

  const toStatus = findColumnOf(next, activeId);
  if (!toStatus) return null;

  if (toStatus === fromStatus && sameOrder(before[toStatus] ?? [], next[toStatus])) {
    return null;
  }

  return { columns: next, toStatus, orderedIds: next[toStatus] };
}
