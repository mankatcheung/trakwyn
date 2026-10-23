import { formatMegabytes, storageLevel, storagePercent } from '../storageUsage';

const MB = 1024 * 1024;
const limitBytes = 100 * MB;

describe('storageLevel', () => {
  it('is ok below 80%, warning from 80%, full at the limit', () => {
    expect(storageLevel({ usedBytes: 79 * MB, limitBytes })).toBe('ok');
    expect(storageLevel({ usedBytes: 80 * MB, limitBytes })).toBe('warning');
    expect(storageLevel({ usedBytes: 99 * MB, limitBytes })).toBe('warning');
    expect(storageLevel({ usedBytes: 100 * MB, limitBytes })).toBe('full');
    expect(storageLevel({ usedBytes: 120 * MB, limitBytes })).toBe('full');
  });
});

describe('storagePercent', () => {
  it('rounds, and never passes 100', () => {
    expect(storagePercent({ usedBytes: 12.4 * MB, limitBytes })).toBe(12);
    expect(storagePercent({ usedBytes: 150 * MB, limitBytes })).toBe(100);
  });
});

describe('formatMegabytes', () => {
  it('keeps at most one decimal', () => {
    expect(formatMegabytes(100 * MB)).toBe('100 MB');
    expect(formatMegabytes(12.46 * MB)).toBe('12.5 MB');
  });
});
