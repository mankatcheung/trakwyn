import { captureEvent } from '../analytics';
import {
  measureColdStart,
  reportAppStarted,
  resetStartupTimingForTests,
  type StartupClock,
} from '../startupTiming';

jest.mock('../analytics', () => ({
  ...jest.requireActual('../analytics'),
  captureEvent: jest.fn(),
}));

const mockedCaptureEvent = jest.mocked(captureEvent);

/**
 * A clock in React Native's timebase, where `now()` counts from system
 * boot: an app launched 10 minutes after boot starts at 600 000 ms.
 */
function clock(now: number, startTime?: number | null): StartupClock {
  return { now: () => now, rnStartupTiming: { startTime } };
}

describe('measureColdStart', () => {
  it('measures from the native start marker', () => {
    expect(measureColdStart(clock(601_234, 600_000))).toEqual({
      duration_ms: 1234,
      start_marker: 'native',
    });
  });

  // performance.now() counts from boot, so without a start mark in the
  // same timebase it would report "time since the phone was switched on".
  it('falls back to module evaluation when the native marker is missing', () => {
    expect(measureColdStart(clock(600_500), 600_100)).toEqual({
      duration_ms: 400,
      start_marker: 'js_module',
    });
  });

  it('ignores a native marker that is not in the same timebase', () => {
    // A marker later than now can only mean a different clock.
    expect(measureColdStart(clock(600_500, 900_000), 600_100)?.start_marker).toBe('js_module');
  });

  it('falls back when reading the native marker throws', () => {
    const throwing: StartupClock = {
      now: () => 600_500,
      get rnStartupTiming(): { startTime: number } {
        throw new Error('NativePerformance is not available');
      },
    };

    expect(measureColdStart(throwing, 600_000)).toEqual({
      duration_ms: 500,
      start_marker: 'js_module',
    });
  });

  it('rounds to whole milliseconds', () => {
    expect(measureColdStart(clock(601_000.6, 600_000.1))?.duration_ms).toBe(1001);
  });

  it('returns null when there is nothing to measure from', () => {
    expect(measureColdStart(clock(600_000), null)).toBeNull();
  });
});

describe('reportAppStarted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStartupTimingForTests();
  });

  it('sends app_started with the duration, its start marker and the outcome', () => {
    reportAppStarted('signed_in', clock(602_000, 600_000));

    expect(mockedCaptureEvent).toHaveBeenCalledWith('app_started', {
      duration_ms: 2000,
      start_marker: 'native',
      outcome: 'signed_in',
    });
  });

  it('sends it once per process, not on every remount', () => {
    reportAppStarted('signed_out', clock(602_000, 600_000));
    reportAppStarted('signed_in', clock(640_000, 600_000));

    expect(mockedCaptureEvent).toHaveBeenCalledTimes(1);
    expect(mockedCaptureEvent).toHaveBeenCalledWith(
      'app_started',
      expect.objectContaining({ outcome: 'signed_out' }),
    );
  });

  it('sends nothing when the start cannot be measured', () => {
    const noClock: StartupClock = {
      now: () => {
        throw new Error('no clock');
      },
    };

    reportAppStarted('signed_in', noClock);

    expect(mockedCaptureEvent).not.toHaveBeenCalled();
  });
});
