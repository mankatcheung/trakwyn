/** The provider events already applied, so a replayed delivery changes nothing (JEF-426). */
export interface IBillingEventRepository {
  /** Records `eventId` for `userId`. False when it was already recorded. */
  tryRecord(eventId: string, userId: string | null): Promise<boolean>;
}
