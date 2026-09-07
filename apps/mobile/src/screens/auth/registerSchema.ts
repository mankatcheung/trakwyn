import { z } from 'zod';
import i18n from '../../i18n';

export const registerSchema = z
  .object({
    email: z.string().superRefine((value, ctx) => {
      if (!z.string().email().safeParse(value).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: i18n.t('auth:validation.invalidEmail'),
        });
      }
    }),
    password: z.string().superRefine((value, ctx) => {
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
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: i18n.t('auth:validation.passwordsDoNotMatch'),
        path: ['confirmPassword'],
      });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;
