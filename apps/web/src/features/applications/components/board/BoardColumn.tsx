import { useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from '#/lib/i18n';
import type { ApplicationDisplayFields } from '#/features/applications/lib/applicationDisplayFields';
import { statusColor } from '#/features/applications/lib/statusColors';
import type { BoardApplication } from '../../graphql/boardQueries';
import { BoardCard } from './BoardCard';

export function BoardColumn({
  status,
  ids,
  appsById,
  displayFields,
}: {
  status: string;
  ids: string[];
  appsById: Map<string, BoardApplication>;
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
      data-screenshot={`board-column-${status}`}
      className={`flex w-60 shrink-0 flex-col rounded-xl border border-t-4 border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-800/50 ${colors.columnBorder} transition-colors ${isOver ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
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
          <span className={`truncate text-xs font-medium capitalize ${colors.columnHeading}`}>
            {t(`status.${status}`)}
          </span>
        </span>
        <span className="rounded-full bg-stone-200 px-1.5 py-0.5 text-xs text-stone-500 dark:bg-stone-700 dark:text-stone-400">
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
  app: BoardApplication;
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
      <BoardCard app={app} displayFields={displayFields} />
    </div>
  );
}
