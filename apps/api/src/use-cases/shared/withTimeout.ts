/**
 * Resolves with `promise`, or rejects with `onTimeout()` once `ms` has
 * passed — whichever comes first. The timer is always cleared, so a fast
 * promise leaves nothing behind. The underlying work is not cancelled (a
 * promise cannot be); what this bounds is how long the caller waits.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
