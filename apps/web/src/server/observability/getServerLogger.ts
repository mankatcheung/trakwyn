/// <reference types="node" />
import { createServerOnlyFn } from '@tanstack/react-start';
import { readServerLogConfig } from './serverLogConfig';
import { createServerLogger, type ServerLogger } from './serverLogger';

let logger: ServerLogger | undefined;

/**
 * The process's one server logger, built on first use rather than at import:
 * `src/start.ts` is bundled for the browser too, and `createServerOnlyFn`
 * both strips this body from that bundle and throws if it is ever called
 * there — so neither `process.env` nor the token can reach the client.
 */
export const getServerLogger = createServerOnlyFn((): ServerLogger => {
  logger ??= createServerLogger({
    config: readServerLogConfig(process.env),
    release: import.meta.env.VITE_APP_RELEASE,
  });
  return logger;
});
