import { createFileRoute, notFound } from '@tanstack/react-router';
import { guidePath } from '#/lib/guideFeeds';
import { getGuide } from '#/lib/guides';
import { marketingHead } from '#/lib/seo';
import { GuidePage } from './-components/GuidePage';

export const Route = createFileRoute('/guides/$slug')({
  beforeLoad: ({ params }) => {
    if (!getGuide(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const guide = getGuide(params.slug);
    if (!guide) return {};
    const { title, description } = guide.frontmatter;
    const head = marketingHead({
      path: guidePath(guide.slug),
      title: `${title} — Trakwyn`,
      description,
    });
    return {
      ...head,
      meta: head.meta.map((tag) =>
        'property' in tag && tag.property === 'og:type' ? { ...tag, content: 'article' } : tag,
      ),
    };
  },
  component: GuideRoute,
});

function GuideRoute() {
  const { slug } = Route.useParams();
  const guide = getGuide(slug);
  if (!guide) throw notFound();
  return <GuidePage guide={guide} />;
}
