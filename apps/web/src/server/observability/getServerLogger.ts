/// <reference types="node" />
import { createServerOnlyFn } from '@tanstack/react-start';
import { readServerLogConfig } from './serverLogConfig';
import { createServerLogger, type ServerLogger } from './serverLogger';

let logger: ServerLogger | undefined;

/**
 * The process's one server logger, built on first use rather than at import:
 * `src/start.ts` is bundled for the browser too, and `createServerOnlyFn`
 * both strips this body from that bundle and throws if it is ever called
 * there — so `process.env` is never read in the browser.
 *
 * The PostHog key and host come from `import.meta.env`, the values Vite
 * inlined at build time, rather than `process.env`: the same ones the
 * browser bundle was built with, so server and client errors always land in
 * the same project. The key is public, so inlining it here costs nothing.
 */
export const getServerLogger = createServerOnlyFn((): ServerLogger => {
  logger ??= createServerLogger({
    config: readServerLogConfig({
      NODE_ENV: process.env.NODE_ENV,
      VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
      VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
    }),
    release: import.meta.env.VITE_APP_RELEASE,
  });
  return logger;
});
