export type Me = {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  targetRole: string | null;
  phone: string | null;
  location: string | null;
  profileLinks: string[];
  avatarUrl: string | null;
  backupEmail: string | null;
  backupEmailVerifiedAt: string | null;
  /** False for an account made through Google or GitHub that never set one (JEF-463). */
  hasPassword: boolean;
};

export interface ImportSummary {
  applicationsImported: number;
  applicationsSkipped: number;
  notesImported: number;
  documentsSkipped: number;
}

export type NotificationPreferences = {
  weeklyDigestEnabled: boolean;
  digestFrequency: 'daily' | 'weekly' | 'off';
  followUpRemindersEnabled: boolean;
  pushNotificationsEnabled: boolean;
  weeklyApplicationGoal: number;
};
