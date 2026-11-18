import { z } from 'zod';

// Mirror PROFILE_CONTACT in apps/api's use-cases/constants.ts (JEF-527); the API
// is the authority, these only save a round trip.
export const MAX_PROFILE_LINKS = 3;
const PHONE_PATTERN = /^\+?[0-9(][0-9 ()./-]*$/;

/** The links in a textarea, one per line, without blanks. */
export function parseProfileLinks(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const profileSchema = z.object({
  name: z.string().max(100, 'Name is too long'),
  timezone: z.string(),
  targetRole: z.string().max(100, 'Target role is too long'),
  phone: z
    .string()
    .max(30, 'Phone number is too long')
    .refine((v) => v.trim() === '' || PHONE_PATTERN.test(v.trim()), 'profile.phoneInvalid'),
  location: z.string().max(100, 'Location is too long'),
  profileLinks: z.string().superRefine((value, ctx) => {
    const links = parseProfileLinks(value);
    if (links.length > MAX_PROFILE_LINKS) {
      ctx.addIssue({ code: 'custom', message: 'profile.profileLinksTooMany' });
    } else if (links.some((link) => !/^https?:\/\/\S+$/i.test(link) || link.length > 200)) {
      ctx.addIssue({ code: 'custom', message: 'profile.profileLinkInvalid' });
    }
  }),
});

export type ProfileForm = z.infer<typeof profileSchema>;
