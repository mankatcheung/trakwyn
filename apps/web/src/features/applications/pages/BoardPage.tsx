import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { gqlClient } from '#/graphql/client';
import type { ApplicationStatus } from '#/graphql/generated/graphql';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '#/components/ErrorState';
import { ListIcon, PlusIcon, StarIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { ApplicationDisplayFieldsPicker } from '#/features/applications/components/ApplicationDisplayFieldsPicker';
import {
  useApplicationDisplayFields,
  type ApplicationDisplayFields,
} from '#/features/applications/lib/applicationDisplayFields';
import { boardApplicationsQueryOptions, type BoardApplication } from '../graphql/boardQueries';
import {
  findColumnOf,
  groupByStatus,
  moveToColumn,
  resolveDragEnd,
  type BoardColumns,
} from '../lib/boardMove';
import { APPLICATION_STATUSES, statusColor } from '#/features/applications/lib/statusColors';
import { Skeleton } from '@trakwyn/ui';

const MOVE_ON_BOARD = `
  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {
    moveApplicationOnBoard(input: $input) { id status boardPosition }
  }
`;

type Application = BoardApplication;

const STATUSES = APPLICATION_STATUSES;

const QUERY_KEY = ['applications', null];

/**
 * Columns now stretch to fill the board's full height (JEF-242), so a short
 * column can have a lot of empty space below its cards. `closestCorners`
 * measures against every droppable's full rect including that empty space,
 * which put the closest match on the wrong column once column heights
 * stopped tracking their card count. `pointerWithin` only matches a
 * droppable the pointer is literally inside, so column height no longer
 * affects which one wins — falls back to `closestCorners` only for
 * `KeyboardSensor`, which has no pointer position to test against.
 */
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

export function KanbanBoard() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const { fields: displayFields, toggleField: toggleDisplayField } = useApplicationDisplayFields();

  const { data, isLoading, isError, error, refetch } = useQuery(boardApplicationsQueryOptions);

  const apps = useMemo(() => data?.applications ?? [], [data]);
  const appsById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const serverColumns = useMemo(() => groupByStatus(apps, STATUSES), [apps]);

  // The board is driven by local state during a drag so the card can preview
  // where it would land. Outside a drag it mirrors the query.
  const [columns, setColumns] = useState<BoardColumns>(serverColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The board as it was when the drag began — what tells a real move from a
  // card picked up and put back down.
  const beforeDrag = useRef<BoardColumns>(serverColumns);

  useEffect(() => {
    // Never resync mid-drag; refetched data would yank the card out from
    // under the pointer.
    if (activeId) return;
    setColumns(serverColumns);
  }, [serverColumns, activeId]);

  const moveOnBoard = useMutation({
    mutationFn: (input: { applicationId: string; toStatus: string; orderedIds: string[] }) =>
      gqlClient.request(MOVE_ON_BOARD, { input }),
    onMutate: async ({ toStatus, orderedIds }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prevData = qc.getQueryData<{ applications: Application[] }>(QUERY_KEY);

      // Write the ranks the server is about to write, so the optimistic board
      // and the refetched one agree and the cards do not visibly resettle.
      const rank = new Map(orderedIds.map((id, index) => [id, index]));
      qc.setQueryData<{ applications: Application[] }>(QUERY_KEY, (old) => {
        if (!old?.applications) return old;
        return {
          ...old,
          applications: old.applications.map((app) =>
            rank.has(app.id)
              ? {
                  ...app,
                  status: toStatus as ApplicationStatus,
                  boardPosition: rank.get(app.id)!,
                }
              : app,
          ),
        };
      });

      return { prevData };
    },
    onError: (_err, _vars, context) => {
      // Restoring the query data is enough — the effect above resyncs the
      // board off it now that no drag is in flight.
      if (context?.prevData) qc.setQueryData(QUERY_KEY, context.prevData);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // The board scrolls sideways on mobile; without a hold delay a drag would
    // steal that scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnLabel = (status: string) => t(`status.${status}`);
  const companyOf = (id: string | null) => (id ? (appsById.get(id)?.company ?? '') : '');

  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      t('board.dragStart', { company: companyOf(String(active.id)) }),
    onDragOver: ({ over }: { active: unknown; over: { id: string | number } | null }) => {
      const column = over && findColumnOf(columns, String(over.id));
      return column
        ? t('board.dragOver', { company: companyOf(activeId), column: columnLabel(column) })
        : undefined;
    },
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: unknown }) => {
      const company = companyOf(String(active.id));
      const column = over
        ? findColumnOf(columns, String((over as { id: string | number }).id))
        : null;
      return column
        ? t('board.dragEnd', { company, column: columnLabel(column) })
        : t('board.dragCancel', { company });
    },
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      t('board.dragCancel', { company: companyOf(String(active.id)) }),
  };

  function handleDragStart(event: DragStartEvent) {
    beforeDrag.current = columns;
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    setColumns((current) => moveToColumn(current, String(active.id), String(over.id)));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const before = beforeDrag.current;
    setActiveId(null);

    if (!over) {
      setColumns(before);
      return;
    }

    const move = resolveDragEnd(columns, before, String(active.id), String(over.id));
    if (!move) {
      setColumns(before);
      return;
    }

    setColumns(move.columns);
    moveOnBoard.mutate({
      applicationId: String(active.id),
      toStatus: move.toStatus,
      orderedIds: move.orderedIds,
    });
  }

  function handleDragCancel() {
    setColumns(beforeDrag.current);
    setActiveId(null);
  }

  const activeApp = activeId ? (appsById.get(activeId) ?? null) : null;

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-96 w-60 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('applications.board')}
        </h1>
        <div className="flex items-center gap-2">
          <ApplicationDisplayFieldsPicker fields={displayFields} onToggle={toggleDisplayField} />
          <Link
            to="/applications"
            aria-label={t('applications.switchToListView')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 dark:border-gray-700 dark:hover:text-gray-200"
          >
            <ListIcon size={13} />
            <span className="hidden sm:inline">{t('applications.list')}</span>
          </Link>
          <Link
            to="/applications/new"
            aria-label={t('applications.newApplicationAria')}
            className="flex items-center gap-1.5 rounded-lg border border-transparent bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <PlusIcon size={15} />
            <span className="hidden sm:inline">{t('applications.newShort')}</span>
          </Link>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        accessibility={{ announcements }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              ids={columns[status] ?? []}
              appsById={appsById}
              displayFields={displayFields}
            />
          ))}
        </div>

        <DragOverlay>
          {activeApp && <AppCard app={activeApp} isOverlay displayFields={displayFields} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  ids,
  appsById,
  displayFields,
}: {
  status: string;
  ids: string[];
  appsById: Map<string, Application>;
  displayFields: ApplicationDisplayFields;
}) {
  const { t } = useLocale();
  const colors = statusColor(status);
  // Kept alongside SortableContext so an empty column is still a drop target —
  // there is no card in it to aim at.
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      data-testid={`board-column-${status}`}
      className={`flex w-60 shrink-0 flex-col rounded-xl border border-t-4 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 ${colors.columnBorder} transition-colors ${isOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        {/* Dot and tinted heading, because the 4px top rule alone is easy to
            miss once a column is scrolled or sitting on a narrow screen. The
            label stays, so colour is never carrying the meaning on its own. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`size-2 shrink-0 rounded-full ${colors.dot}`}
            aria-hidden="true"
            data-testid={`column-dot-${status}`}
          />
          <span className={`truncate text-xs font-semibold capitalize ${colors.columnHeading}`}>
            {t(`status.${status}`)}
          </span>
        </span>
        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {ids.length}
        </span>
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {ids.map((id) => {
            const app = appsById.get(id);
            return app ? <SortableCard key={id} app={app} displayFields={displayFields} /> : null;
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({
  app,
  displayFields,
}: {
  app: Application;
  displayFields: ApplicationDisplayFields;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.id,
  });

  // A finished drag still lands a click on the link underneath, which would
  // navigate away from the board the user was just arranging. Latch the drag
  // and swallow that one click.
  const draggedRef = useRef(false);
  useEffect(() => {
    if (isDragging) draggedRef.current = true;
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      onClickCapture={(e) => {
        if (draggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          draggedRef.current = false;
        }
      }}
      {...listeners}
      {...attributes}
    >
      <AppCard app={app} displayFields={displayFields} />
    </div>
  );
}

function AppCard({
  app,
  isOverlay,
  displayFields,
}: {
  app: Application;
  isOverlay?: boolean;
  displayFields: ApplicationDisplayFields;
}) {
  const { t } = useLocale();
  const showMetaRow =
    (displayFields.starred && app.starred) ||
    displayFields.date ||
    displayFields.status ||
    (displayFields.ghosted && app.likelyGhosted);
  return (
    <Link
      to="/applications/$applicationId"
      params={{ applicationId: app.id }}
      className={`block rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600 ${isOverlay ? 'rotate-1 shadow-xl' : ''}`}
      onClick={(e) => {
        if (isOverlay) e.preventDefault();
      }}
    >
      <p className="line-clamp-2 text-xs font-semibold text-gray-900 dark:text-gray-100">
        {app.company}
      </p>
      {displayFields.role && (
        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{app.role}</p>
      )}
      {displayFields.location && app.location && (
        <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{app.location}</p>
      )}
      {displayFields.tags && app.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {app.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center truncate rounded-sm bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            >
              {tag}
            </span>
          ))}
          {app.tags.length > 2 && (
            <span className="text-[10px] text-gray-400">+{app.tags.length - 2}</span>
          )}
        </div>
      )}
      {/* Date rides inline in the meta row rather than as its own stacked
          line: a taller card shifts the drag geometry the board's pointer
          tests are tuned against (JEF-230 e2e regression). */}
      {showMetaRow && (
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1">
            {displayFields.starred && app.starred && (
              <StarIcon size={11} className="shrink-0 fill-yellow-400 text-yellow-400" />
            )}
            {displayFields.date && (
              <span className="truncate text-[11px] text-gray-400">
                {new Date(app.appliedAt ?? app.createdAt).toLocaleDateString()}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {displayFields.status && <StatusBadge status={app.status as ApplicationStatus} />}
            {displayFields.ghosted && app.likelyGhosted && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {t('applications.likelyGhosted')}
              </span>
            )}
          </span>
        </div>
      )}
    </Link>
  );
}
