/**
 * Seed profiles (JEF-684). The default profile is the developer seed: it keeps
 * the "Quota Demo" applications that the quota hints (JEF-494) and their tests
 * rely on. The marketing profile is what the marketing screenshots are taken
 * from, so it leaves those out and uses a believable, fictional person instead
 * of "Demo User". Both keep `demo@trakwyn.app` as the login.
 */
export interface SeedPersona {
  name: string;
  /** The address printed on the résumé, not the login (`DEMO_EMAIL`). */
  email: string;
  phone: string;
}

export const DEFAULT_PERSONA: SeedPersona = {
  name: 'Demo User',
  email: 'demo@example.com',
  phone: '+1 212 555 0142',
};

export const MARKETING_PERSONA: SeedPersona = {
  name: 'Maya Chen',
  email: 'maya.chen@example.com',
  phone: '+1 212 555 0142',
};

export const SEED_PROFILE_NAMES = ['default', 'marketing'] as const;
export type SeedProfileName = (typeof SEED_PROFILE_NAMES)[number];

export interface SeedProfile {
  persona: SeedPersona;
  includeQuotaDemo: boolean;
}

export const SEED_PROFILES: Record<SeedProfileName, SeedProfile> = {
  default: { persona: DEFAULT_PERSONA, includeQuotaDemo: true },
  marketing: { persona: MARKETING_PERSONA, includeQuotaDemo: false },
};

export function isSeedProfileName(value: string): value is SeedProfileName {
  return (SEED_PROFILE_NAMES as readonly string[]).includes(value);
}

export const personaContact = (persona: SeedPersona): string =>
  [persona.name, persona.email, persona.phone].join('\n');
