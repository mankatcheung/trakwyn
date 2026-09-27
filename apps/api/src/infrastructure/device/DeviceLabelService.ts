import { parseTrakwynClientUserAgent } from '#src/infrastructure/device/trakwynClientUserAgent.js';

/**
 * Parses a raw User-Agent string into a human-readable device label.
 *
 * The label is intentionally short (e.g. "Mac — Chrome 120") so it fits
 * nicely in the active-sessions UI without wrapping.
 */
export class DeviceLabelService {
  /**
   * Returns a friendly device label derived from the given User-Agent string,
   * or "Unknown device" when the UA is null / unrecognisable.
   */
  describe(userAgent: string | null): string {
    if (!userAgent) return 'Unknown device';

    const app = this.parseMobileApp(userAgent);
    if (app) return app;

    const os = this.parseOs(userAgent);
    const browser = this.parseBrowser(userAgent);

    if (os && browser) return `${os} — ${browser}`;
    if (os) return os;
    if (browser) return browser;
    return 'Unknown device';
  }

  // ── Trakwyn mobile app ────────────────────────────────────────────────

  /**
   * apps/mobile sends `TrakwynMobile/<version> (<model>; <os> <version>)`
   * (src/lib/userAgent.ts; parsed by trakwynClientUserAgent.ts). Without this the phone arrives as OkHttp's or
   * CFNetwork's default string, which nothing below recognises.
   */
  private parseMobileApp(ua: string): string | null {
    const app = parseTrakwynClientUserAgent(ua);
    if (!app) return null;
    const device = app.model ?? app.os;
    return device ? `${device} — Trakwyn app` : 'Trakwyn app';
  }

  // ── OS detection ──────────────────────────────────────────────────────

  private parseOs(ua: string): string | null {
    if (/Windows NT 10/.test(ua)) return 'Windows PC';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac OS X/.test(ua)) return 'Mac';
    if (/CrOS/.test(ua)) return 'Chromebook';
    if (/Android/.test(ua)) return this.formatAndroidDevice(ua);
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Linux/.test(ua)) return 'Linux device';
    return null;
  }

  private formatAndroidDevice(ua: string): string {
    const m = ua.match(/;\s*([^;)]+)\s*Build/);
    const model = m?.[1]?.trim();
    return model ? `Android (${model})` : 'Android device';
  }

  // ── Browser detection ─────────────────────────────────────────────────

  private parseBrowser(ua: string): string | null {
    // Order matters: some brands embed others (e.g. "Edg" inside Chrome-like UA).
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
    if (/Vivaldi/.test(ua)) return 'Vivaldi';
    if (/Brave/.test(ua)) return 'Brave';

    const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
    if (chromeMatch) {
      // If also has Safari, it's a real Chrome/Chromium — not an iOS wrapper.
      if (/Safari\//.test(ua)) return `Chrome ${chromeMatch[1]}`;
      // iOS Chrome is actually WebKit under the hood.
      return 'Chrome';
    }

    const firefoxMatch = ua.match(/Firefox\/([\d.]+)/);
    if (firefoxMatch) return `Firefox ${firefoxMatch[1]}`;

    const safariMatch = ua.match(/Version\/([\d.]+).*Safari/);
    if (safariMatch && /Safari\//.test(ua)) return `Safari ${safariMatch[1]}`;

    return null;
  }
}
