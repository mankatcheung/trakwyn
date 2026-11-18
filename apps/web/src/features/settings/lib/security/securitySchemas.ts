import { z } from 'zod';

export const emailSchema = z.object({
  // Optional: an account with no password steps up instead (JEF-463). The
  // page requires it when `me.hasPassword`, and so does the API.
  currentPassword: z.string().optional(),
  newEmail: z.email('Invalid email'),
});

export const backupEmailSchema = z.object({
  currentPassword: z.string().optional(),
  backupEmail: z.email('Invalid email'),
});

export const removeBackupEmailSchema = z.object({
  currentPassword: z.string().optional(),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const reauthSchema = z.object({
  password: z.string().min(1, 'Required'),
  code: z.string().optional(),
});

export const totpBeginSchema = z.object({
  password: z.string().min(1, 'Required'),
});

export const totpConfirmSchema = z.object({
  code: z.string().min(6, 'Enter the 6-digit code').max(6, 'Enter the 6-digit code'),
});

export const totpDisableSchema = z.object({
  password: z.string().min(1, 'Required'),
});

export type EmailForm = z.infer<typeof emailSchema>;
export type BackupEmailForm = z.infer<typeof backupEmailSchema>;
export type RemoveBackupEmailForm = z.infer<typeof removeBackupEmailSchema>;
export type PasswordForm = z.infer<typeof passwordSchema>;
export type ReauthForm = z.infer<typeof reauthSchema>;
export type TotpBeginForm = z.infer<typeof totpBeginSchema>;
export type TotpConfirmForm = z.infer<typeof totpConfirmSchema>;
export type TotpDisableForm = z.infer<typeof totpDisableSchema>;
