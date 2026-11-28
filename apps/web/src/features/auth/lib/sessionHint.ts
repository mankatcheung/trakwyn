import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import { SESSION_HINT_COOKIE } from '#/constants';
import { hasSessionCookie } from '#/graphql/client';

/**
 * `hasSessionCookie` for a render that also happens on the server. Both sides
 * read the same cookie (the API sets it on the shared domain, so the web server
 * receives it), which is what lets them render the same thing. Like the client
 * check it is only a hint, never authorization.
 */
export const hasSessionHint = createIsomorphicFn()
  .server(() => Boolean(getCookie(SESSION_HINT_COOKIE)))
  .client(() => hasSessionCookie());
