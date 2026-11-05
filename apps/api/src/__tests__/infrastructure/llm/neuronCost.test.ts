import { describe, it, expect } from 'vitest';
import { costMismatch, neuronsToMicros } from '#src/infrastructure/llm/neuronCost.js';

describe('neuronsToMicros', () => {
  it('prices a neuron at $0.011 per 1,000, i.e. 11 micro-USD', () => {
    expect(neuronsToMicros(1_000)).toBe(11_000);
    expect(neuronsToMicros(0)).toBe(0);
  });

  it('rounds to a whole micro-USD', () => {
    expect(neuronsToMicros(0.04)).toBe(0);
    expect(neuronsToMicros(12.5)).toBe(138);
  });
});

describe('costMismatch', () => {
  it('is null when the two agree within 25%', () => {
    expect(costMismatch(100_000, 100_000)).toBeNull();
    expect(costMismatch(100_000, 120_000)).toBeNull();
    expect(costMismatch(120_000, 100_000)).toBeNull();
  });

  it('says over when the estimate is higher, under when it is lower', () => {
    expect(costMismatch(200_000, 100_000)).toBe('over');
    expect(costMismatch(100_000, 200_000)).toBe('under');
  });

  it('ignores a gap below the rounding floor, however large it is relatively', () => {
    expect(costMismatch(10, 100)).toBeNull();
    expect(costMismatch(0, 150)).toBeNull();
  });

  it('flags a priced call whose neuron cost is zero once the gap clears the floor', () => {
    expect(costMismatch(5_000, 0)).toBe('over');
  });
});
