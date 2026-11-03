import { describe, it, expect } from 'vitest';
import {
  isInHostedAiRollout,
  parseAllowlist,
  parseRolloutPercent,
  rolloutBucket,
} from '#src/infrastructure/llm/hostedAiRollout.js';
import { PlatformLLMProviderFactory } from '#src/infrastructure/llm/PlatformLLMProviderFactory.js';

const ids = Array.from({ length: 2000 }, (_, i) => `user-${i}`);

describe('rolloutBucket', () => {
  it('is stable and within 0-99', () => {
    for (const id of ids.slice(0, 50)) {
      const b = rolloutBucket(id);
      expect(b).toBe(rolloutBucket(id));
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });
});

describe('parseRolloutPercent', () => {
  it('defaults to 100 when unset or blank', () => {
    expect(parseRolloutPercent(undefined)).toBe(100);
    expect(parseRolloutPercent('  ')).toBe(100);
  });
  it('clamps and treats junk as 0', () => {
    expect(parseRolloutPercent('10')).toBe(10);
    expect(parseRolloutPercent('250')).toBe(100);
    expect(parseRolloutPercent('-5')).toBe(0);
    expect(parseRolloutPercent('ten')).toBe(0);
  });
});

describe('parseAllowlist', () => {
  it('splits, trims and drops empties', () => {
    expect([...parseAllowlist(' a, b ,,c')]).toEqual(['a', 'b', 'c']);
    expect(parseAllowlist(undefined).size).toBe(0);
  });
});

describe('isInHostedAiRollout', () => {
  it('admits nobody at 0 and everybody at 100', () => {
    expect(ids.some((id) => isInHostedAiRollout(id, '0', undefined))).toBe(false);
    expect(ids.every((id) => isInHostedAiRollout(id, '100', undefined))).toBe(true);
  });
  it('admits roughly the requested share and grows monotonically', () => {
    const at10 = ids.filter((id) => isInHostedAiRollout(id, '10', undefined));
    const at50 = ids.filter((id) => isInHostedAiRollout(id, '50', undefined));
    expect(at10.length).toBeGreaterThan(120);
    expect(at10.length).toBeLessThan(280);
    expect(at10.every((id) => at50.includes(id))).toBe(true);
  });
  it('always admits an allowlisted user, even at 0', () => {
    expect(isInHostedAiRollout('staff-1', '0', 'x, staff-1')).toBe(true);
    expect(isInHostedAiRollout('other', '0', 'x, staff-1')).toBe(false);
  });
});

describe('PlatformLLMProviderFactory.isEnabledFor', () => {
  it('is false for everyone when hosted AI is off, allowlist or not', () => {
    const f = new PlatformLLMProviderFactory({ env: { HOSTED_AI_ALLOWLIST: 'u1' } });
    expect(f.isEnabledFor('u1')).toBe(false);
  });
  it('applies the percentage and allowlist when on', () => {
    const f = new PlatformLLMProviderFactory({
      env: {
        HOSTED_AI_ENABLED: 'true',
        HOSTED_AI_ROLLOUT_PERCENT: '0',
        HOSTED_AI_ALLOWLIST: 'u1',
      },
    });
    expect(f.isEnabledFor('u1')).toBe(true);
    expect(f.isEnabledFor('u2')).toBe(false);
    expect(f.isEnabled()).toBe(true);
  });
});
