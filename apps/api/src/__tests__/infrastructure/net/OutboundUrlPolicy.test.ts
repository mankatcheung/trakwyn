import { describe, it, expect, vi } from 'vitest';
import {
  OutboundUrlPolicy,
  classifyAddress,
  isPrivateAddress,
} from '#src/infrastructure/net/OutboundUrlPolicy.js';
import { SECURITY_EVENTS } from '#src/infrastructure/config/constants.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';

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

describe('classifyAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['::1', 'loopback'],
    ['10.1.2.3', 'rfc1918'],
    ['172.16.0.1', 'rfc1918'],
    ['192.168.1.1', 'rfc1918'],
    ['169.254.169.254', 'link_local'],
    ['fe80::1', 'link_local'],
    ['100.64.0.1', 'cgnat'],
    ['fd12::1', 'ula'],
    ['fc00::1', 'ula'],
    ['224.0.0.1', 'multicast'],
    ['ff02::1', 'multicast'],
    ['0.0.0.0', 'unspecified'],
    ['::', 'unspecified'],
    ['::ffff:10.0.0.1', 'rfc1918'],
    ['8.8.8.8', 'public'],
    ['2606:4700::1111', 'public'],
    ['not-an-ip', 'not_an_ip'],
  ])('classifies %s as %s', (ip, expected) => {
    expect(classifyAddress(ip)).toBe(expected);
  });
});

/**
 * JEF-350. The refusal already worked; nobody found out it had happened.
 * These assert the two halves of finding out — and, just as importantly,
 * that finding out does not itself ship the URL to Axiom (JEF-348).
 */
describe('OutboundUrlPolicy reporting', () => {
  const reporting = (addresses: Record<string, string[]> = {}) => {
    const logger = makeLogger();
    const metrics = makeFakeMetrics();
    const policy = new OutboundUrlPolicy({
      strict: true,
      lookup: resolving(addresses),
      logger,
      metrics,
    });
    return { policy, logger, metrics };
  };

  const fields = (logger: ReturnType<typeof makeLogger>) =>
    vi.mocked(logger.warn).mock.calls[0]?.[1];

  it('records nothing when the URL is allowed', async () => {
    const { policy, logger, metrics } = reporting({ 'api.example.com': ['93.184.216.34'] });

    await policy.assertAllowed('https://api.example.com/v1', 'llm-provider');

    expect(logger.warn).not.toHaveBeenCalled();
    expect(metrics.outboundUrlRefused).toEqual([]);
  });

  it('reports the hostname, port, address class and reason of a metadata probe', async () => {
    const { policy, logger, metrics } = reporting({ 'metadata.example.com': ['169.254.169.254'] });

    await expect(
      policy.assertAllowed('http://metadata.example.com/latest/meta-data/', 'job-posting'),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(fields(logger)).toEqual({
      event: SECURITY_EVENTS.OUTBOUND_URL_REFUSED,
      reason: 'private_address',
      purpose: 'job-posting',
      hostname: 'metadata.example.com',
      port: 80,
      addressClass: 'link_local',
    });
    expect(metrics.outboundUrlRefused).toEqual([
      { reason: 'private_address', purpose: 'job-posting' },
    ]);
  });

  it.each([
    ['not a url', 'invalid_url'],
    ['file:///etc/passwd', 'unsupported_scheme'],
    ['https://user:pw@example.com/', 'embedded_credentials'],
    ['http://example.com/v1', 'insecure_provider_url'],
    ['https://example.com:6379/', 'blocked_port'],
    ['https://redis.internal/', 'reserved_hostname'],
    ['https://nope.invalid/', 'unresolvable_host'],
    ['https://127.0.0.1/', 'private_address'],
  ])('reports %s with reason %s', async (url, reason) => {
    const { policy, logger, metrics } = reporting({ 'example.com': ['93.184.216.34'] });

    await expect(policy.assertAllowed(url, 'llm-provider')).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    expect(fields(logger)).toMatchObject({ reason });
    expect(metrics.outboundUrlRefused).toEqual([{ reason, purpose: 'llm-provider' }]);
  });

  /**
   * A job-posting URL carries a query string and a query string carries user
   * data, so the path and query must never reach the log — the hostname is
   * the whole of what is reported about where the request was headed.
   */
  it('never logs the path, query string or full URL', async () => {
    const { policy, logger } = reporting();

    await expect(
      policy.assertAllowed(
        'http://169.254.169.254/latest/meta-data/iam/?token=s3cret&email=someone@example.com',
        'job-posting',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const logged = JSON.stringify(fields(logger));
    expect(logged).not.toContain('s3cret');
    expect(logged).not.toContain('someone@example.com');
    expect(logged).not.toContain('meta-data');
    expect(logged).not.toContain('/latest');
  });

  it('reports a refusal in permissive mode too — the checks that still run are still refusals', async () => {
    const logger = makeLogger();
    const metrics = makeFakeMetrics();
    const policy = new OutboundUrlPolicy({
      strict: false,
      lookup: resolving({}),
      logger,
      metrics,
    });

    await expect(policy.assertAllowed('file:///etc/hosts', 'job-posting')).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    expect(metrics.outboundUrlRefused).toEqual([
      { reason: 'unsupported_scheme', purpose: 'job-posting' },
    ]);
  });

  it('still refuses when no logger is supplied', async () => {
    await expect(
      new OutboundUrlPolicy({ strict: true, lookup: resolving({}) }).assertAllowed(
        'http://127.0.0.1/',
        'job-posting',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
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
