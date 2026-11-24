import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { heroPreloadLinks } from '../features/marketing/pages/heroPreloads';
import { LandingPage } from '../features/marketing/pages/LandingPage';

export const Route = createFileRoute('/')({
  // Real content worth indexing — unlike /login and /register (which stay
  // ssr: false, since they're utility pages behind a client-only auth
  // check, not marketing pages), this route SSRs unconditionally. The
  // logged-in CTA swap lives in a client-only effect in LandingPage, which is
  // also why no ssr: false is needed here (see JEF-206) — the API and web app
  // are on separate domains, so hasSessionCookie() still can't run on the
  // server either way.
  head: ({ match }) =>
    marketingHead({ path: '/', seo: 'home' }, match.context.pageLocale, heroPreloadLinks('board')),
  component: LandingPage,
});
