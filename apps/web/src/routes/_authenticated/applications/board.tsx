import { createFileRoute } from '@tanstack/react-router';
import { boardApplicationsQueryOptions } from './-board-queries';
import { KanbanBoard } from './-board-page';

export const Route = createFileRoute('/_authenticated/applications/board')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(boardApplicationsQueryOptions),
  component: KanbanBoard,
});
