import { z } from 'zod';
import i18n from '../../i18n';

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().superRefine((value, ctx) => {
      if (value.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: i18n.t('auth:validation.passwordMinLength'),
        });
      }
    }),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: i18n.t('auth:validation.passwordsDoNotMatch'),
        path: ['confirmPassword'],
      });
    }
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
