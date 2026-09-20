import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  rootLogger,
  setRootLogger,
  resetRootLogger,
} from '#src/infrastructure/observability/rootLogger.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

describe('rootLogger', () => {
  afterEach(() => {
    resetRootLogger();
    vi.restoreAllMocks();
  });

  /**
   * The point of the indirection: the Postgres pool, the cache and the
   * session blocklist capture `rootLogger` when they are constructed, which
   * is before `buildApp` exists to hand them a pino logger. A holder that
   * resolved its target at capture time would pin them to the fallback
   * forever, and none of their lines would ever reach Axiom.
   */
  it('forwards to the logger set after the reference was taken', () => {
    const captured = rootLogger;
    const logger = makeLogger();
    setRootLogger(logger);

    const err = new Error('late');
    captured.error('after the fact', err);
    captured.warn('degraded');

    expect(logger.error).toHaveBeenCalledWith('after the fact', err);
    expect(logger.warn).toHaveBeenCalledWith('degraded', undefined);
  });

  it('uses the console until one is set, rather than dropping the line', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const err = new Error('during startup');
    rootLogger.error('too early for pino', err);
    rootLogger.warn('also too early');

    expect(error).toHaveBeenCalledWith('too early for pino', err);
    // No second argument: pino reads a leading object as its merge target, so
    // passing `undefined` through would cost the message on the real logger.
    expect(warn).toHaveBeenCalledWith('also too early');
  });

  it('follows a later replacement rather than the first logger it was given', () => {
    const first = makeLogger();
    const second = makeLogger();
    setRootLogger(first);
    setRootLogger(second);

    rootLogger.error('only the second', new Error('x'));

    expect(first.error).not.toHaveBeenCalled();
    expect(second.error).toHaveBeenCalled();
  });
});
