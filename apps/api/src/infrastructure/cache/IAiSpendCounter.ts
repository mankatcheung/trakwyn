/** Where `HostedAiSpendGuard` keeps a day's running total, in micro-USD. */
export interface IAiSpendCounter {
  /** Today's total so far; 0 for a key never written. Rejects when the store cannot be read. */
  get(key: string): Promise<number>;
  add(key: string, micros: number): Promise<void>;
}
