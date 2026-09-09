import { notifyManager } from '@tanstack/react-query';

/**
 * Teardown every Jest tier shares (JEF-300, G-7).
 *
 * The suite used to end with "A worker process has failed to exit gracefully",
 * on every run, with `--detectOpenHandles` reporting nothing — it forces
 * `--runInBand`, where the warning cannot occur. Instrumenting global.setTimeout
 * and dumping what was still armed at afterAll found it: five-minute React Query
 * garbage-collection timers, dozens of them, from Query.scheduleGc and
 * Mutation.scheduleGc.
 *
 * A cache schedules one for each query the moment its last observer goes away.
 * Unmounting a screen is that moment, and @testing-library/react-native unmounts
 * after every test — so any suite that renders anything backed by useQuery ends
 * with real timers armed for the next five minutes and a worker that cannot
 * exit. Jest force-kills it, which is harmless at 17 seconds on a laptop and is
 * exactly the shape of a CI build that goes red once in twenty runs.
 *
 * Two changes, both scoped to tests:
 */

// 1. Nothing under test needs a cache that outlives its observers, so tests get
//    clients that collect immediately. Spread first, so a suite that genuinely
//    wants a gcTime can still set one.
interface ClientConfig {
  defaultOptions?: { queries?: object; mutations?: object };
}

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');

  class TestQueryClient extends actual.QueryClient {
    constructor(config: ClientConfig = {}) {
      super({
        ...config,
        defaultOptions: {
          ...config.defaultOptions,
          queries: { gcTime: 0, ...config.defaultOptions?.queries },
          mutations: { gcTime: 0, ...config.defaultOptions?.mutations },
        },
      });
    }
  }

  return { ...actual, QueryClient: TestQueryClient };
});

// 2. React Query batches observer notifications behind a setTimeout(0). In an
//    app that coalesces renders; in a test it lands state updates after the test
//    that caused them has finished, which is what the "not wrapped in act(...)"
//    warnings throughout this suite were. A synchronous scheduler is the
//    documented way to make the cache deterministic under test.
notifyManager.setScheduler((callback) => callback());
