import { describe, expect, it } from 'vitest';
import { offerFormSchema } from '#/features/offers/lib/offerFormSchema';

const valid = {
  baseSalary: '120000',
  bonus: '',
  currency: 'USD',
  period: 'YEARLY',
  equity: '',
  benefits: '',
  costOfLivingAdjustment: '',
  notes: '',
};

function messages(input: Record<string, unknown>) {
  const result = offerFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('offerFormSchema', () => {
  it('parses the numeric text fields into numbers and blanks into null', () => {
    const data = offerFormSchema.parse(valid);
    expect(data.baseSalary).toBe(120000);
    expect(data.bonus).toBeNull();
    expect(data.costOfLivingAdjustment).toBeNull();
  });

  it('keeps the plain string fields as typed', () => {
    const data = offerFormSchema.parse({ ...valid, equity: '0.1%', notes: 'n', benefits: 'b' });
    expect(data).toMatchObject({ currency: 'USD', period: 'YEARLY', equity: '0.1%', notes: 'n' });
  });

  it('trims the numeric fields before parsing', () => {
    const data = offerFormSchema.parse({ ...valid, baseSalary: ' 95000 ', bonus: ' 5000 ' });
    expect(data.baseSalary).toBe(95000);
    expect(data.bonus).toBe(5000);
  });

  it('accepts decimals', () => {
    expect(offerFormSchema.parse({ ...valid, baseSalary: '1234.5' }).baseSalary).toBe(1234.5);
  });

  it.each(['', '   '])('asks for a base salary when it is %j', (baseSalary) => {
    expect(messages({ ...valid, baseSalary })).toEqual([['baseSalary', 'Enter a base salary']]);
  });

  it('rejects text as a base salary instead of turning it into NaN', () => {
    expect(messages({ ...valid, baseSalary: 'abc' })).toEqual([['baseSalary', 'Must be a number']]);
  });

  it.each(['0', '-5'])('rejects a base salary of %s', (baseSalary) => {
    expect(messages({ ...valid, baseSalary })).toEqual([['baseSalary', 'Must be greater than 0']]);
  });

  it('allows a bonus of 0 but not a negative one', () => {
    expect(offerFormSchema.parse({ ...valid, bonus: '0' }).bonus).toBe(0);
    expect(messages({ ...valid, bonus: '-1' })).toEqual([['bonus', 'Must be 0 or more']]);
  });

  it('rejects text as a bonus or a cost-of-living adjustment', () => {
    expect(messages({ ...valid, bonus: 'lots' })).toEqual([['bonus', 'Must be a number']]);
    expect(messages({ ...valid, costOfLivingAdjustment: 'x' })).toEqual([
      ['costOfLivingAdjustment', 'Must be a number'],
    ]);
  });

  it('lets the cost-of-living adjustment be negative', () => {
    expect(offerFormSchema.parse({ ...valid, costOfLivingAdjustment: '-3' })).toMatchObject({
      costOfLivingAdjustment: -3,
    });
  });
});
