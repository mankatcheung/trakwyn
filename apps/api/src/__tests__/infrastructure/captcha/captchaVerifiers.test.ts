import { describe, it, expect, vi, afterEach } from 'vitest';
import { TurnstileCaptchaVerifier } from '#src/infrastructure/captcha/TurnstileCaptchaVerifier.js';
import { PermissiveCaptchaVerifier } from '#src/infrastructure/captcha/PermissiveCaptchaVerifier.js';
import { buildCaptchaVerifier } from '#src/infrastructure/captcha/buildCaptchaVerifier.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

const reply = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

const make = (fetchImpl: typeof fetch) =>
  new TurnstileCaptchaVerifier({ secretKey: 'secret', logger: makeLogger(), fetchImpl });

describe('TurnstileCaptchaVerifier', () => {
  it('posts the secret, token and ip to siteverify and accepts success', async () => {
    const fetchImpl = reply({ success: true });

    await expect(make(fetchImpl).verify('tok', '203.0.113.1')).resolves.toBe(true);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('203.0.113.1');
  });

  it('omits remoteip when the ip is unknown', async () => {
    const fetchImpl = reply({ success: true });

    await make(fetchImpl).verify('tok', null);

    expect((fetchImpl.mock.calls[0][1].body as URLSearchParams).has('remoteip')).toBe(false);
  });

  it('refuses when the provider says no', async () => {
    await expect(make(reply({ success: false })).verify('tok', null)).resolves.toBe(false);
  });

  it.each([null, undefined, ''])(
    'refuses a blank token (%s) without calling the provider',
    async (token) => {
      const fetchImpl = reply({ success: true });

      await expect(make(fetchImpl).verify(token, null)).resolves.toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('refuses an oversized token without calling the provider', async () => {
    const fetchImpl = reply({ success: true });

    await expect(make(fetchImpl).verify('x'.repeat(2049), null)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on a non-2xx answer', async () => {
    await expect(make(reply({ success: true }, 500)).verify('tok', null)).resolves.toBe(false);
  });

  it('fails closed when the request throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(make(fetchImpl).verify('tok', null)).resolves.toBe(false);
  });
});

describe('buildCaptchaVerifier', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  const configure = (env: Record<string, string | undefined>) => {
    process.env = {
      ...original,
      CAPTCHA_PROVIDER: undefined,
      TURNSTILE_SECRET_KEY: undefined,
      ...env,
    };
  };

  it('is permissive outside production by default', () => {
    configure({ NODE_ENV: 'test' });

    expect(buildCaptchaVerifier(makeLogger())).toBeInstanceOf(PermissiveCaptchaVerifier);
  });

  it('is Turnstile in production by default', () => {
    configure({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 's' });

    expect(buildCaptchaVerifier(makeLogger())).toBeInstanceOf(TurnstileCaptchaVerifier);
  });

  it('refuses to build Turnstile without its secret', () => {
    configure({ NODE_ENV: 'production' });

    expect(() => buildCaptchaVerifier(makeLogger())).toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it('honours an explicit CAPTCHA_PROVIDER over NODE_ENV', () => {
    configure({ NODE_ENV: 'production', CAPTCHA_PROVIDER: 'disabled' });

    expect(buildCaptchaVerifier(makeLogger())).toBeInstanceOf(PermissiveCaptchaVerifier);
  });

  it('rejects an unknown provider name', () => {
    configure({ CAPTCHA_PROVIDER: 'recaptcha' });

    expect(() => buildCaptchaVerifier(makeLogger())).toThrow(/CAPTCHA_PROVIDER/);
  });
});
