import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildNewDeviceLoginAlertHtml } from '#src/infrastructure/email/templates/newDeviceLoginAlertTemplate.js';
import { ENV } from '#src/infrastructure/config/constants.js';

describe('buildNewDeviceLoginAlertHtml', () => {
  const original = process.env[ENV.WEB_APP_ORIGIN];
  const loginTime = new Date('2026-08-20T09:00:00.000Z');

  const build = () =>
    buildNewDeviceLoginAlertHtml('Chrome on macOS', 'London, GB', '203.0.113.4', loginTime);

  beforeEach(() => {
    process.env[ENV.WEB_APP_ORIGIN] = 'https://www.trakwyn.com';
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV.WEB_APP_ORIGIN];
    else process.env[ENV.WEB_APP_ORIGIN] = original;
  });

  it('links to the configured origin', () => {
    expect(build()).toContain('href="https://www.trakwyn.com/settings/security"');
  });

  it('includes the device, location, IP and time so the reader can judge it', () => {
    const html = build();

    expect(html).toContain('Chrome on macOS');
    expect(html).toContain('London, GB');
    expect(html).toContain('203.0.113.4');
  });

  it('escapes the device label, location and IP', () => {
    const html = buildNewDeviceLoginAlertHtml(
      '<img src=x onerror=alert(1)>',
      '<b>Paris</b>',
      '1.2.3.4"><script>',
      loginTime,
    );

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Paris');
    expect(html).not.toContain('<script>');
  });

  it.each([undefined, '', '   '])('refuses to build the email when the origin is %j', (value) => {
    if (value === undefined) delete process.env[ENV.WEB_APP_ORIGIN];
    else process.env[ENV.WEB_APP_ORIGIN] = value;

    // This link is where someone goes when they think they have been
    // compromised. Guessing an origin would send them somewhere that is not
    // Trakwyn at exactly the wrong moment, so not sending is the better
    // failure.
    expect(() => build()).toThrow(/WEB_APP_ORIGIN is not set/);
  });

  it('never falls back to a hardcoded deployment URL', () => {
    delete process.env[ENV.WEB_APP_ORIGIN];

    let html = '';
    try {
      html = build();
    } catch {
      // expected
    }

    expect(html).not.toMatch(/vercel\.app/);
    expect(html).not.toMatch(/job-finder/);
  });
});
