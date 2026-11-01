import { describe, it, expect } from 'vitest';
import { maskApiKey } from '../../lib/maskApiKey.js';

describe('maskApiKey', () => {
  it('shows the token prefix and the last four characters only', () => {
    const key = 'trakwyn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxcdef';
    expect(maskApiKey(key)).toBe('trakwyn_…cdef');
  });

  it('never reveals random characters after the prefix', () => {
    const key = 'trakwyn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxWXYZ';
    expect(maskApiKey(key)).not.toContain('xxxx');
  });

  it('shows no tail for a key too short to mask safely', () => {
    expect(maskApiKey('trakwyn_abc')).toBe('trakwyn_…');
  });

  it('shows no prefix for a key that is not a Trakwyn token', () => {
    expect(maskApiKey('other-xxxxxxxxxxxxxxxxxxx-1234')).toBe('…1234');
  });
});
