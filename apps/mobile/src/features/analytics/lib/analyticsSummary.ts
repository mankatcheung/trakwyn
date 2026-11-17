// Ported from apps/web's apps/web/src/features/analytics/pages/AnalyticsPage.tsx —
// same ISO-week bucketing and funnel/rate derivations, kept as pure
// functions so they're unit-testable independent of the chart rendering.
import { APPLICATION_STATUSES, type ApplicationStatus } from '../../applications/types';
import type { AnalyticsApplication } from '../types';

export function isoWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export interface WeeklyPoint {
  week: string;
  count: number;
}

export function buildWeeklyData(apps: AnalyticsApplication[]): WeeklyPoint[] {
  const weekCounts: Record<string, number> = {};
  for (const a of apps) {
    const w = isoWeek(new Date(a.createdAt));
    weekCounts[w] = (weekCounts[w] ?? 0) + 1;
  }
  return Object.entries(weekCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([week, count]) => ({ week: week.replace(/^\d{4}-/, ''), count }));
}

export interface FunnelPoint {
  status: ApplicationStatus;
  count: number;
}

export function buildFunnelData(apps: AnalyticsApplication[]): FunnelPoint[] {
  return APPLICATION_STATUSES.map((status) => ({
    status,
    count: apps.filter((a) => a.status === status).length,
  }));
}

export interface AnalyticsSummaryStats {
  totalApps: number;
  activeApps: number;
  responseRate: number;
  successRate: number;
  ghostingRate: number;
}

export function computeSummaryStats(apps: AnalyticsApplication[]): AnalyticsSummaryStats {
  const appliedOrBeyond = apps.filter((a) => a.status !== 'draft');
  const gotResponse = appliedOrBeyond.filter((a) => !['applied', 'draft'].includes(a.status));
  const responseRate =
    appliedOrBeyond.length > 0
      ? Math.round((gotResponse.length / appliedOrBeyond.length) * 100)
      : 0;

  const ghostedApps = appliedOrBeyond.filter((a) => a.likelyGhosted);
  const ghostingRate =
    appliedOrBeyond.length > 0
      ? Math.round((ghostedApps.length / appliedOrBeyond.length) * 100)
      : 0;

  const totalApps = apps.length;
  const activeApps = apps.filter((a) =>
    ['applied', 'interviewing', 'offered'].includes(a.status),
  ).length;
  const successRate =
    totalApps > 0
      ? Math.round((apps.filter((a) => a.status === 'accepted').length / totalApps) * 100)
      : 0;

  return { totalApps, activeApps, responseRate, successRate, ghostingRate };
}
