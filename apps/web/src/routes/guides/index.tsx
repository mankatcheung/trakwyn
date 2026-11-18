import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { GuidesIndexPage } from '../../features/guides/pages/GuidesIndexPage';

export const Route = createFileRoute('/guides/')({
  validateSearch: (search: Record<string, unknown>): { tag?: string } => ({
    tag: typeof search.tag === 'string' && search.tag ? search.tag : undefined,
  }),
  head: ({ match }) => marketingHead({ path: '/guides', seo: 'guides' }, match.context.pageLocale),
  component: GuidesIndexRoute,
});

function GuidesIndexRoute() {
  const { tag } = Route.useSearch();
  return <GuidesIndexPage tag={tag} />;
}
