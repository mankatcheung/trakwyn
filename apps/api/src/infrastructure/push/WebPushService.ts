import { ENV } from '#src/infrastructure/config/constants.js';
import type {
  IWebPushService,
  PushPayload,
  PushSubscriptionKeys,
} from '#src/use-cases/ports/IWebPushService.js';

/**
 * Thin wrapper around the Web Push API using the `web-push` library.
 * VAPID keys are read from env vars at construction time.
 */
export class WebPushService implements IWebPushService {
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly subject: string;
  private readonly isConfigured: boolean;

  constructor() {
    this.publicKey = process.env[ENV.VAPID_PUBLIC_KEY] ?? '';
    this.privateKey = process.env[ENV.VAPID_PRIVATE_KEY] ?? '';
    this.subject = process.env[ENV.VAPID_SUBJECT] ?? 'mailto:noreply@trakwyn.com';
    this.isConfigured = Boolean(this.publicKey && this.privateKey);
  }

  getVapidPublicKey(): string {
    return this.publicKey;
  }

  async send(subscription: PushSubscriptionKeys, payload: PushPayload): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('VAPID keys not configured');
    }

    // Dynamic import so web-push is only loaded when actually needed
    const webpush = await import('web-push');
    webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: { url: payload.url },
      }),
    );
  }
}
