import { describe, it, expect, vi } from 'vitest';
import { OutboundUrlPolicy, isPrivateAddress } from '#src/infrastructure/net/OutboundUrlPolicy.js';

const resolving = (addresses: Record<string, string[]>) =>
  vi.fn(async (hostname: string) => {
    if (!(hostname in addresses)) throw new Error(`ENOTFOUND ${hostname}`);
    return addresses[hostname];
  });

const strict = (addresses: Record<string, string[]> = {}) =>
  new OutboundUrlPolicy({ strict: true, lookup: resolving(addresses) });

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fd12::1',
    'fe80::1',
    '::ffff:10.0.0.1',
  ])('treats %s as private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '104.18.0.1', '172.32.0.1', '2606:4700::1111'])(
    'treats %s as public',
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );

  it('treats something that is not an IP as private (fail closed)', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });
});

describe('OutboundUrlPolicy', () => {
  describe('in every mode', () => {
    it('rejects a malformed URL', async () => {
      await expect(strict().assertAllowed('not a url', 'job-posting')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('rejects non-http(s) schemes', async () => {
      await expect(
        strict().assertAllowed('file:///etc/passwd', 'job-posting'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(
        strict().assertAllowed('ftp://example.com/', 'job-posting'),
      ).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it('rejects embedded credentials', async () => {
      await expect(
        strict({ 'example.com': ['93.184.216.34'] }).assertAllowed(
          'https://user:pw@example.com/',
          'job-posting',
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('strict mode', () => {
    it('allows a public https host', async () => {
      await expect(
        strict({ 'api.example.com': ['93.184.216.34'] }).assertAllowed(
          'https://api.example.com/v1/chat/completions',
          'llm-provider',
        ),
      ).resolves.toBeUndefined();
    });

    it('requires https for an LLM provider but not for a job posting', async () => {
      const policy = strict({ 'jobs.example.com': ['93.184.216.34'] });
      await expect(
        policy.assertAllowed('http://jobs.example.com/v1', 'llm-provider'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(
        policy.assertAllowed('http://jobs.example.com/posting/1', 'job-posting'),
      ).resolves.toBeUndefined();
    });

    it.each([
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://192.168.1.10:8080/',
      'http://127.0.0.1:3001/admin/trash/purge',
      'http://[::1]:3001/',
      'http://0.0.0.0/',
    ])('rejects a literal private address: %s', async (url) => {
      await expect(strict().assertAllowed(url, 'job-posting')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });

    it.each([
      'http://localhost/',
      'http://api.localhost/',
      'http://redis.internal/',
      'http://printer.local/',
    ])('rejects a reserved hostname without resolving it: %s', async (url) => {
      const lookup = resolving({});
      const policy = new OutboundUrlPolicy({ strict: true, lookup });
      await expect(policy.assertAllowed(url, 'job-posting')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects a public-looking hostname that resolves to a private address', async () => {
      const policy = strict({ 'metadata.example.com': ['169.254.169.254'] });
      await expect(
        policy.assertAllowed('https://metadata.example.com/', 'llm-provider'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects a hostname if any of its addresses is private', async () => {
      const policy = strict({ 'mixed.example.com': ['93.184.216.34', '10.0.0.1'] });
      await expect(
        policy.assertAllowed('https://mixed.example.com/', 'llm-provider'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects a hostname that does not resolve', async () => {
      await expect(
        strict().assertAllowed('https://nope.invalid/', 'llm-provider'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('rejects ports that only make sense for internal services', async () => {
      const policy = strict({ 'db.example.com': ['93.184.216.34'] });
      await expect(
        policy.assertAllowed('https://db.example.com:6379/', 'llm-provider'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(
        policy.assertAllowed('https://db.example.com:8443/', 'llm-provider'),
      ).resolves.toBeUndefined();
    });
  });

  describe('permissive mode (development, CI)', () => {
    it('allows localhost and private addresses so the fake provider and self-hosted models work', async () => {
      const lookup = resolving({});
      const policy = new OutboundUrlPolicy({ strict: false, lookup });
      await expect(
        policy.assertAllowed(
          'http://localhost:3001/llm-test/fake/chat/completions',
          'llm-provider',
        ),
      ).resolves.toBeUndefined();
      await expect(
        policy.assertAllowed('http://192.168.1.20:11434/v1', 'llm-provider'),
      ).resolves.toBeUndefined();
      expect(lookup).not.toHaveBeenCalled();
    });

    it('still rejects schemes other than http(s)', async () => {
      const policy = new OutboundUrlPolicy({ strict: false, lookup: resolving({}) });
      await expect(policy.assertAllowed('file:///etc/hosts', 'job-posting')).rejects.toMatchObject({
        code: 'VALIDATION',
      });
    });
  });

  it('honours an explicit OUTBOUND_URL_POLICY over the NODE_ENV default (F13)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OUTBOUND_URL_POLICY', 'permissive');
    try {
      expect(new OutboundUrlPolicy()['strict']).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OUTBOUND_URL_POLICY', 'strict');
    try {
      expect(new OutboundUrlPolicy()['strict']).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OUTBOUND_URL_POLICY', 'nonsense');
    try {
      expect(new OutboundUrlPolicy()['strict']).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('defaults to strict only when NODE_ENV is production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(new OutboundUrlPolicy()['strict']).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    vi.stubEnv('NODE_ENV', 'test');
    try {
      expect(new OutboundUrlPolicy()['strict']).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
