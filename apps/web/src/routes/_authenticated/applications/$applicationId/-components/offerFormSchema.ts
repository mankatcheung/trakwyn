import { z } from 'zod';

/**
 * Number inputs keep their text in the form, so a blank bonus can stay blank
 * (sent as `null`) and "abc" is rejected rather than turned into `NaN`.
 */
const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.coerce.number<string>('Must be a number').nullable());

export const offerFormSchema = z.object({
  baseSalary: z
    .string()
    .trim()
    .min(1, 'Enter a base salary')
    .pipe(z.coerce.number<string>('Must be a number').positive('Must be greater than 0')),
  bonus: optionalNumber.pipe(z.number().min(0, 'Must be 0 or more').nullable()),
  currency: z.string(),
  period: z.string(),
  equity: z.string(),
  benefits: z.string(),
  costOfLivingAdjustment: optionalNumber,
  notes: z.string(),
});

/** What the fields hold while the user types. */
export type OfferFormInput = z.input<typeof offerFormSchema>;
/** What `onSubmit` receives once the schema has parsed it. */
export type OfferFormData = z.output<typeof offerFormSchema>;
