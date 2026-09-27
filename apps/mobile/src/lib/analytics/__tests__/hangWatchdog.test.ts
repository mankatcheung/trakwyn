import { addBreadcrumb, captureException } from '../analytics';
import { resetHangWatchdogForTests, startHangWatchdog } from '../hangWatchdog';
import {
  APP_HANG_THRESHOLD_MS,
  HANG_BREADCRUMB_MS,
  HANG_MAX_PLAUSIBLE_MS,
  HANG_WATCHDOG_INTERVAL_MS,
} from '../../../constants';

jest.mock('../analytics', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

const mockedAddBreadcrumb = jest.mocked(addBreadcrumb);
const mockedCaptureException = jest.mocked(captureException);

const ROUTE = '/(app)/applications/[id]';

/**
 * Fake timers drive the interval; a separate fake clock says how much time
 * really passed. A block is simulated by moving the clock further than the
 * timers — which is exactly what a busy JS thread looks like from inside:
 * the tick fires once, late.
 */
function harness() {
  let time = 1_000_000;
  const stop = startHangWatchdog({ getRoute: () => ROUTE, now: () => time });

  return {
    stop,
    /** One tick, `blockedMs` late. */
    tick(blockedMs = 0) {
      time += HANG_WATCHDOG_INTERVAL_MS + blockedMs;
      jest.advanceTimersByTime(HANG_WATCHDOG_INTERVAL_MS);
    },
  };
}

describe('startHangWatchdog', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetHangWatchdogForTests();
  });

  afterEach(() => {
    stop?.();
    jest.useRealTimers();
  });

  it('reports nothing while ticks arrive on time', () => {
    const watchdog = harness();
    stop = watchdog.stop;

    for (let i = 0; i < 10; i += 1) watchdog.tick(HANG_BREADCRUMB_MS - 1);

    expect(mockedAddBreadcrumb).not.toHaveBeenCalled();
    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it('leaves a breadcrumb for a block below the hang threshold', () => {
    const watchdog = harness();
    stop = watchdog.stop;

    watchdog.tick(APP_HANG_THRESHOLD_MS - 1);

    expect(mockedAddBreadcrumb).toHaveBeenCalledWith('JS thread blocked', {
      blocked_ms: APP_HANG_THRESHOLD_MS - 1,
      route: ROUTE,
    });
    expect(mockedCaptureException).not.toHaveBeenCalled();
  });

  it('reports an app_hang once the block reaches the threshold', () => {
    const watchdog = harness();
    stop = watchdog.stop;

    watchdog.tick(APP_HANG_THRESHOLD_MS);

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    const [error, properties] = mockedCaptureException.mock.calls[0];
    expect((error as Error).message).toBe('JS thread blocked');
    expect(properties).toEqual({
      kind: 'app_hang',
      blocked_ms: APP_HANG_THRESHOLD_MS,
      route: ROUTE,
    });
  });

  it('reports only the first hang, but still breadcrumbs the rest', () => {
    const watchdog = harness();
    stop = watchdog.stop;

    watchdog.tick(3000);
    watchdog.tick();
    watchdog.tick(5000);

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    expect(mockedCaptureException.mock.calls[0][1]).toMatchObject({ blocked_ms: 3000 });
    expect(mockedAddBreadcrumb).toHaveBeenCalledTimes(2);
  });

  it('keeps to one report across a stop and restart, as on a trip to the background', () => {
    const first = harness();
    first.tick(3000);
    first.stop();

    const second = harness();
    stop = second.stop;
    second.tick(3000);

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
  });

  // The backgrounding event can miss the process before it is frozen, so a
  // timer can survive a suspension and fire late by the whole time away.
  it('reads a gap past the plausible maximum as a suspension, not a hang', () => {
    const watchdog = harness();
    stop = watchdog.stop;

    watchdog.tick(HANG_MAX_PLAUSIBLE_MS + 1);
    expect(mockedAddBreadcrumb).not.toHaveBeenCalled();
    expect(mockedCaptureException).not.toHaveBeenCalled();

    // …and does not spend the one report a real hang afterwards needs.
    watchdog.tick(3000);
    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
  });

  it('stops ticking once stopped', () => {
    const watchdog = harness();
    watchdog.stop();

    watchdog.tick(3000);

    expect(mockedAddBreadcrumb).not.toHaveBeenCalled();
  });
});
