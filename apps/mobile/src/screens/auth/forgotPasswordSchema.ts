import { z } from 'zod';
import i18n from '../../i18n';

export const forgotPasswordSchema = z.object({
  email: z.string().superRefine((value, ctx) => {
    if (!z.string().email().safeParse(value).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: i18n.t('auth:validation.invalidEmail'),
      });
    }
  }),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
