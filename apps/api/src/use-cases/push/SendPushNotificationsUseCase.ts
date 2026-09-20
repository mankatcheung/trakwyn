import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IPushSubscriptionRepository } from '#src/use-cases/ports/IPushSubscriptionRepository.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IWebPushService } from '#src/use-cases/ports/IWebPushService.js';
import type { IExpoPushService } from '#src/use-cases/ports/IExpoPushService.js';
import type { ICreateNotificationUseCase } from '#src/use-cases/notifications/ICreateNotificationUseCase.js';
import type { NotificationType } from '#src/domain/notification/Notification.js';
import { NOTIFICATION_TYPE, REMINDER_WINDOW_MS } from '#src/use-cases/constants.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  userRepository: IUserRepository;
  pushSubscriptionRepository: IPushSubscriptionRepository;
  logger: ILogger;
  webPushService: IWebPushService;
  expoPushService: IExpoPushService;
  createNotificationUseCase: ICreateNotificationUseCase;
}

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
}

export interface PushNotificationsSummary {
  /** Individual pushes accepted by web-push or Expo, counted per subscription. */
  delivered: number;
  /** Pushes that threw; the run continued past each one. */
  failed: number;
}

export class SendPushNotificationsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(): Promise<PushNotificationsSummary> {
    const notificationsByUser = new Map<string, NotificationPayload[]>();
    const notifiedRoundIds: string[] = [];

    // Collect upcoming interview notifications (within 24h, not completed or already notified)
    const upcomingInterviews = await this.deps.interviewRoundRepository.findUpcomingWithinWindow(
      REMINDER_WINDOW_MS.DUE_WITHIN,
    );

    const now = new Date();

    for (const round of upcomingInterviews) {
      if (!round.scheduledAt) continue;

      const app = await this.deps.applicationRepository.findById(round.applicationId);
      if (!app) continue;

      const timeStr = round.scheduledAt.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });

      const existing = notificationsByUser.get(app.userId) ?? [];
      existing.push({
        userId: app.userId,
        type: NOTIFICATION_TYPE.INTERVIEW_REMINDER,
        title: `Upcoming interview: ${app.company}`,
        body: `${app.role} \u2014 ${round.type} interview tomorrow at ${timeStr}`,
        // Deep-links straight to the Interviews section (JEF-208's
        // ?section= schema) rather than the default Notes tab, so the user
        // doesn't have to navigate to find the round this is actually about.
        url: `/applications/${app.id}?section=interviews`,
      });
      notificationsByUser.set(app.userId, existing);
      notifiedRoundIds.push(round.id);
    }

    // Collect follow-up reminders (due now, deduplicated by existing reminderSentAt)
    const dueForFollowUp = await this.deps.applicationRepository.findDueForReminder();

    for (const app of dueForFollowUp) {
      const existing = notificationsByUser.get(app.userId) ?? [];
      existing.push({
        userId: app.userId,
        type: NOTIFICATION_TYPE.FOLLOW_UP_REMINDER,
        title: `Follow up: ${app.company}`,
        body: `Time to follow up on your ${app.role} application`,
        // Contacts, not the default Notes tab — following up means reaching
        // out to someone, and this is where that someone's info lives.
        url: `/applications/${app.id}?section=contacts`,
      });
      notificationsByUser.set(app.userId, existing);
    }

    // Persist every notification to the inbox regardless of push-delivery
    // outcome \u2014 a disabled/unsubscribed user should still see it later.
    for (const notifications of notificationsByUser.values()) {
      for (const notification of notifications) {
        await this.deps.createNotificationUseCase.execute(notification);
      }
    }

    // Send notifications
    let delivered = 0;
    let failed = 0;
    for (const [userId, notifications] of notificationsByUser) {
      const user = await this.deps.userRepository.findById(userId);
      if (!user || !user.pushNotificationsEnabled) continue;

      const subscriptions = await this.deps.pushSubscriptionRepository.findByUserId(userId);
      if (subscriptions.length === 0) continue;

      for (const notification of notifications) {
        for (const sub of subscriptions) {
          try {
            if (sub.provider === 'expo') {
              await this.deps.expoPushService.send(sub.endpoint, notification);
            } else {
              await this.deps.webPushService.send(
                { endpoint: sub.endpoint, p256dh: sub.p256dh!, auth: sub.auth! },
                notification,
              );
            }
            delivered++;
          } catch (err) {
            failed++;
            this.deps.logger.error('Failed to send push notification', err);
            // If the subscription is expired/invalid, remove it — a web-push
            // 410 or an Expo 'DeviceNotRegistered' ticket both mean the same
            // thing: nothing will ever be delivered to this endpoint again.
            const code =
              typeof err === 'object' && err !== null
                ? ((err as { statusCode?: number; code?: string }).statusCode ??
                  (err as { code?: string }).code)
                : undefined;
            if (code === 410 || code === 'DeviceNotRegistered') {
              await this.deps.pushSubscriptionRepository.deleteByEndpoint(sub.endpoint);
            }
          }
        }
      }
    }

    // Mark interview rounds as notified so they aren't re-sent on the next cron run
    for (const roundId of notifiedRoundIds) {
      try {
        await this.deps.interviewRoundRepository.updatePushNotificationSentAt(roundId, now);
      } catch {
        // Best-effort — don't let a single failure block the whole batch
      }
    }

    return { delivered, failed };
  }
}
