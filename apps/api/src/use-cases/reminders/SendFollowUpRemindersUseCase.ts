import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  userRepository: IUserRepository;
  emailService: IEmailService;
  entitlementService: IEntitlementService;
}

export interface FollowUpRemindersSummary {
  /** Reminders emailed and marked as sent. */
  sent: number;
  /** Applications whose reminder threw; the run continued past each one. */
  failed: number;
  /** Due applications whose owner is gone, has reminders turned off, or is not on a plan that includes them. */
  skipped: number;
}

export class SendFollowUpRemindersUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(): Promise<FollowUpRemindersSummary> {
    const apps = await this.deps.applicationRepository.findDueForReminder();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const app of apps) {
      const user = await this.deps.userRepository.findById(app.userId);
      if (!user || !user.followUpRemindersEnabled) {
        skipped++;
        continue;
      }
      // Reminders are a Pro feature. The application stays due, so upgrading
      // later still sends it rather than losing it.
      if (!this.deps.entitlementService.forUser(user).features.notifications) {
        skipped++;
        continue;
      }
      try {
        await this.deps.emailService.sendFollowUpReminder(
          user.email,
          app.company,
          app.role,
          app.followUpAt!,
        );
        await this.deps.applicationRepository.updateReminderSentAt(app.id, new Date());
        sent++;
      } catch {
        // continue — one failure shouldn't block the rest. Counted so the
        // route's summary line reports a partial run as partial (JEF-352).
        failed++;
      }
    }

    return { sent, failed, skipped };
  }
}
