export interface WeeklyDigestData {
  totalApplications: number;
  byStatus: Record<string, number>;
  newThisWeek: Array<{ company: string; role: string }>;
  overdueFollowUps: Array<{ company: string; role: string; followUpAt: Date }>;
  upcomingFollowUps: Array<{ company: string; role: string; followUpAt: Date }>;
  weeklyApplicationGoal?: number;
  currentWeekApplicationCount?: number;
  applicationStreakWeeks?: number;
}

export interface IEmailService {
  sendFollowUpReminder(to: string, company: string, role: string, followUpAt: Date): Promise<void>;
  sendWeeklyDigest(
    to: string,
    data: WeeklyDigestData,
    frequency?: 'daily' | 'weekly',
  ): Promise<void>;
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  sendEmailVerification(to: string, verifyUrl: string): Promise<void>;
  sendBackupEmailVerification(to: string, verifyUrl: string): Promise<void>;
  /** The 6-digit code an account without a password re-authenticates with (JEF-463). */
  sendStepUpCode(to: string, code: string): Promise<void>;
  /** The link that turns a deletion request into a scheduled deletion (JEF-463). */
  sendAccountDeletionConfirmation(to: string, confirmUrl: string): Promise<void>;
  /** Deletion is scheduled for `deletionDate`; `cancelUrl` stops it without signing in (JEF-463). */
  sendAccountDeletionScheduled(
    to: string,
    deletionDate: Date,
    cancelUrl: string,
    hadSubscription: boolean,
  ): Promise<void>;
  /** A scheduled deletion was cancelled, so the owner hears of it if they did not do it (JEF-463). */
  sendAccountDeletionCancelled(to: string): Promise<void>;
  sendNewDeviceLoginAlert(
    to: string,
    deviceLabel: string,
    location: string | null,
    ipAddress: string | null,
    loginTime: Date,
  ): Promise<void>;
}
