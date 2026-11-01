import { describe, it, expect } from 'vitest';
import { maskApiKey } from '../../lib/maskApiKey.js';

describe('maskApiKey', () => {
  it('shows the token prefix and the last four characters only', () => {
    const key = 'trakwyn_0123456789abcdef0123456789abcdef';
    expect(maskApiKey(key)).toBe('trakwyn_…cdef');
  });

  it('never reveals random characters after the prefix', () => {
    const key = 'trakwyn_SECRETSECRETSECRETWXYZ';
    expect(maskApiKey(key)).not.toContain('SECRET');
  });

  it('shows no tail for a key too short to mask safely', () => {
    expect(maskApiKey('trakwyn_abc')).toBe('trakwyn_…');
  });

  it('shows no prefix for a key that is not a Trakwyn token', () => {
    expect(maskApiKey('some-other-key-value-1234')).toBe('…1234');
  });
});
