import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ipRateLimit } from '#src/http/adapters/fastify/ipRateLimit.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';

function fakeRequest(limiter: IRateLimiter, ip = '203.0.113.7'): FastifyRequest {
  return { ip, diScope: { cradle: { oauthRateLimiter: limiter } } } as unknown as FastifyRequest;
}

function fakeReply() {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

const limiter = (allow: boolean): IRateLimiter => ({
  consume: vi.fn().mockResolvedValue(allow),
  isLimited: vi.fn().mockResolvedValue(!allow),
});

describe('ipRateLimit', () => {
  it('lets a request through while the IP has attempts left', async () => {
    const l = limiter(true);
    const reply = fakeReply();
    await ipRateLimit('oauthRateLimiter', 'oauth')(
      fakeRequest(l),
      reply as unknown as FastifyReply,
    );
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('keys the bucket by route name and IP, category first so logs never carry the address', async () => {
    const l = limiter(true);
    await ipRateLimit('oauthRateLimiter', 'oauth')(
      fakeRequest(l),
      fakeReply() as unknown as FastifyReply,
    );
    expect(l.consume).toHaveBeenCalledWith('oauth:ip:203.0.113.7');
  });

  it('answers 429 rate_limited once the budget is spent', async () => {
    const reply = fakeReply();
    await ipRateLimit('oauthRateLimiter', 'oauth')(
      fakeRequest(limiter(false)),
      reply as unknown as FastifyReply,
    );
    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith({ error: 'rate_limited' });
  });
});
