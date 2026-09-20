import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IEmailService, WeeklyDigestData } from '#src/use-cases/ports/IEmailService.js';
import { DIGEST_FREQUENCY, DIGEST_WINDOW_MS, DURATIONS_MS } from '#src/use-cases/constants.js';
import { getWeeklyApplicationGoalStats } from '#src/use-cases/user/weeklyApplicationGoal.js';

interface Deps {
  userRepository: IUserRepository;
  applicationRepository: IApplicationRepository;
  emailService: IEmailService;
}

export interface DigestSummary {
  totalUsers: number;
  sent: number;
  skipped: number;
  /**
   * Users whose digest threw. `Promise.allSettled` already kept the rest of
   * the run going past them; counting the rejections is what stops a partial
   * run reporting as a clean one in the route's summary line (JEF-352).
   */
  failed: number;
}

const SEVEN_DAYS_MS = DURATIONS_MS.WEEK;
const DAY_MS = 24 * 60 * 60 * 1000;

export class SendWeeklyDigestUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(): Promise<DigestSummary> {
    const users = await this.deps.userRepository.findAll();
    let sent = 0;
    let skipped = 0;

    const results = await Promise.allSettled(
      users.map(async (user) => {
        const frequency = user.digestFrequency ?? (user.weeklyDigestEnabled ? 'weekly' : 'off');
        if (
          frequency === DIGEST_FREQUENCY.OFF ||
          (!user.weeklyDigestEnabled && frequency === 'weekly')
        ) {
          skipped++;
          return;
        }

        const now = new Date();

        if (
          user.lastDigestSentAt &&
          user.lastDigestSentAt.getTime() >
            now.getTime() -
              (frequency === DIGEST_FREQUENCY.DAILY
                ? DIGEST_WINDOW_MS.DAILY_RESEND_AFTER
                : DIGEST_WINDOW_MS.RESEND_AFTER)
        ) {
          skipped++;
          return;
        }

        const apps = await this.deps.applicationRepository.findAllByUserId(user.id);
        if (apps.length === 0) {
          skipped++;
          return;
        }

        const periodMs = frequency === DIGEST_FREQUENCY.DAILY ? DAY_MS : SEVEN_DAYS_MS;
        const periodAgo = new Date(now.getTime() - periodMs);
        const nextPeriod = new Date(now.getTime() + periodMs);

        const byStatus: Record<string, number> = {};
        for (const app of apps) {
          byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
        }

        const newThisWeek = apps
          .filter((a) => a.createdAt >= periodAgo)
          .map((a) => ({ company: a.company, role: a.role }));

        const overdueFollowUps = apps
          .filter(
            (a) =>
              a.followUpAt != null &&
              a.followUpAt < now &&
              !['rejected', 'accepted', 'withdrawn'].includes(a.status),
          )
          .map((a) => ({ company: a.company, role: a.role, followUpAt: a.followUpAt! }));

        const upcomingFollowUps = apps
          .filter((a) => a.followUpAt != null && a.followUpAt >= now && a.followUpAt <= nextPeriod)
          .map((a) => ({ company: a.company, role: a.role, followUpAt: a.followUpAt! }));

        const data: WeeklyDigestData = {
          totalApplications: apps.length,
          byStatus,
          newThisWeek,
          overdueFollowUps,
          upcomingFollowUps,
          weeklyApplicationGoal: user.weeklyApplicationGoal,
          currentWeekApplicationCount: getWeeklyApplicationGoalStats(
            apps,
            user.weeklyApplicationGoal,
            now,
          ).currentWeekCount,
          applicationStreakWeeks: getWeeklyApplicationGoalStats(
            apps,
            user.weeklyApplicationGoal,
            now,
          ).streakWeeks,
        };

        if (frequency === DIGEST_FREQUENCY.DAILY) {
          await this.deps.emailService.sendWeeklyDigest(user.email, data, frequency);
        } else {
          await this.deps.emailService.sendWeeklyDigest(user.email, data);
        }
        await this.deps.userRepository.updateLastDigestSentAt(user.id, now);
        sent++;
      }),
    );

    const failed = results.filter((result) => result.status === 'rejected').length;

    return { totalUsers: users.length, sent, skipped, failed };
  }
}
