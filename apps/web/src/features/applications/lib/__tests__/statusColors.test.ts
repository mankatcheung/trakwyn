import { describe, it, expect } from 'vitest';
import {
  APPLICATION_STATUSES,
  STATUS_COLORS,
  statusColor,
} from '#/features/applications/lib/statusColors';

describe('status colour palette', () => {
  it('covers every application status', () => {
    for (const status of APPLICATION_STATUSES) {
      expect(STATUS_COLORS[status]).toBeDefined();
    }
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...APPLICATION_STATUSES].sort());
  });

  it('gives every status a complete set of cues', () => {
    for (const status of APPLICATION_STATUSES) {
      const colors = STATUS_COLORS[status];
      expect(colors.tone).toBeTruthy();
      expect(colors.dot).toMatch(/^bg-/);
      expect(colors.columnBorder).toMatch(/^border-t-/);
      expect(colors.columnHeading).toMatch(/^text-/);
    }
  });

  it('lists the statuses in pipeline order', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'draft',
      'applied',
      'interviewing',
      'offered',
      'accepted',
      'rejected',
      'withdrawn',
    ]);
  });

  it('maps each status to the agreed colour', () => {
    // The point of the module: before it, the board said purple/orange/green
    // for interviewing/offered/accepted while StatusBadge said
    // yellow/green/emerald, so one application had two colours depending on
    // the screen. Pinning the tones here is what stops that drifting back.
    expect(STATUS_COLORS.draft.tone).toBe('gray');
    expect(STATUS_COLORS.applied.tone).toBe('blue');
    expect(STATUS_COLORS.interviewing.tone).toBe('purple');
    expect(STATUS_COLORS.offered.tone).toBe('orange');
    expect(STATUS_COLORS.accepted.tone).toBe('green');
    expect(STATUS_COLORS.rejected.tone).toBe('red');
    expect(STATUS_COLORS.withdrawn.tone).toBe('slate');
  });

  it('gives each status a distinct dot colour', () => {
    const dots = APPLICATION_STATUSES.map((s) => STATUS_COLORS[s].dot);
    expect(new Set(dots).size).toBe(dots.length);
  });

  describe('statusColor', () => {
    it('resolves a known status', () => {
      expect(statusColor('interviewing')).toBe(STATUS_COLORS.interviewing);
    });

    it('falls back to neutral for a status this build does not know', () => {
      // A value from a newer API, or a hand-edited URL search param. It must
      // still get a dot and a border rather than rendering uncoloured.
      const fallback = statusColor('teleported');
      expect(fallback.tone).toBe('gray');
      expect(fallback.dot).toMatch(/^bg-/);
      expect(fallback.columnBorder).toMatch(/^border-t-/);
    });
  });
});
