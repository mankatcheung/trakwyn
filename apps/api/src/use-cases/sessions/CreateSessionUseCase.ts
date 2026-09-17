import type { ISessionRepository } from '#src/use-cases/ports/ISessionRepository.js';
import type { IUserRepository } from '#src/use-cases/ports/IUserRepository.js';
import type { IDeviceLabeler } from '#src/use-cases/ports/IDeviceLabeler.js';
import type { IIpLocationResolver } from '#src/use-cases/ports/IIpLocationResolver.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';
import type { ICreateNotificationUseCase } from '#src/use-cases/notifications/ICreateNotificationUseCase.js';
import type { Session } from '#src/domain/session/Session.js';
import { NOTIFICATION_TYPE, SESSION } from '#src/use-cases/constants.js';

interface Deps {
  sessionRepository: ISessionRepository;
  userRepository: IUserRepository;
  deviceLabeler: IDeviceLabeler;
  ipLocationResolver: IIpLocationResolver;
  emailService: IEmailService;
  createNotificationUseCase: ICreateNotificationUseCase;
  generateId: () => string;
}

export interface CreateSessionInput {
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
}

export class CreateSessionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: CreateSessionInput): Promise<Session> {
    const deviceLabel = this.deps.deviceLabeler.describe(input.userAgent);
    const location = await this.deps.ipLocationResolver.lookup(input.ipAddress);

    // Snapshot known user-agents *before* inserting this session — querying
    // after insertion would always find this session's own userAgent already
    // persisted, making every login look like a "known" device.
    const knownUserAgents = input.userAgent
      ? await this.deps.sessionRepository.findDistinctUserAgentsByUserId(input.userId)
      : [];

    const session = await this.deps.sessionRepository.create({
      id: this.deps.generateId(),
      userId: input.userId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      deviceLabel,
      location,
      expiresAt: new Date(Date.now() + SESSION.TTL_MS),
      currentRefreshTokenId: this.deps.generateId(),
    });

    // Check if this is a new device. Awaited so the alert completes before the
    // response is sent — Cloud Run throttles CPU once no request is in flight, so
    // a fire-and-forget promise can stall or be dropped before it finishes. Errors
    // are still swallowed so session creation is never blocked by the alert path.
    await this.detectNewDeviceAndAlert(
      input.userId,
      input.userAgent,
      deviceLabel,
      location,
      input.ipAddress,
      knownUserAgents,
    ).catch(() => {});

    return session;
  }

  /**
   * Detects whether the current userAgent has been seen before for this user.
   * If not, sends a new-device login alert email. Failures are silently ignored
   * so session creation is never blocked by email delivery issues.
   */
  private async detectNewDeviceAndAlert(
    userId: string,
    userAgent: string | null,
    deviceLabel: string,
    location: string | null,
    ipAddress: string | null,
    knownUserAgents: string[],
  ): Promise<void> {
    if (!userAgent) return;

    // If this is the user's very first session, don't alert (registration or first login).
    if (knownUserAgents.length === 0) return;

    const isKnown = knownUserAgents.includes(userAgent);
    if (isKnown) return;

    const user = await this.deps.userRepository.findById(userId);
    if (!user?.email) return;

    // The in-app notification goes first, and the email is allowed to fail on
    // its own. They carry the same warning by two routes, and the email is the
    // fragile one — a third-party API, and a template that now refuses to
    // build a link it cannot trust. Sending it first meant any of that took
    // the notification down with it, leaving a user with a suspicious sign-in
    // and no warning at all.
    await this.deps.createNotificationUseCase.execute({
      userId,
      type: NOTIFICATION_TYPE.SECURITY_ALERT,
      title: 'New sign-in detected',
      body: location ? `${deviceLabel} signed in from ${location}` : `${deviceLabel} signed in`,
      // #security-activity scrolls straight to the login-event list this
      // alert is actually about, instead of the top of a long settings page
      // (SettingsSecurityPage.tsx scrolls to it on mount).
      url: '/settings/security#security-activity',
    });

    await this.deps.emailService.sendNewDeviceLoginAlert(
      user.email,
      deviceLabel,
      location,
      ipAddress,
      new Date(),
    );
  }
}
