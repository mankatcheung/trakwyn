import { createFileRoute } from '@tanstack/react-router';
import { boardApplicationsQueryOptions } from '../../../features/applications/graphql/boardQueries';
import { KanbanBoard } from '../../../features/applications/pages/BoardPage';

export const Route = createFileRoute('/_authenticated/applications/board')({
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...boardApplicationsQueryOptions, staleTime: 'static' }),
  component: KanbanBoard,
});
