import { LLM_PROVIDER_LABEL } from './shared';

/** The platform's entry in the user's provider order; every other entry is the id of one of their keys (JEF-503). */
export const TRAKWYN_ENTRY = 'trakwyn';

/** What a person calls an entry of the provider order: "Trakwyn AI", or the provider's name. */
export function providerEntryLabel(entry: string, t: (key: string) => string): string {
  return entry === TRAKWYN_ENTRY ? t('aiSource.trakwyn') : (LLM_PROVIDER_LABEL[entry] ?? entry);
}

/** Moves the entry at `index` one place toward the front (-1) or the back (1); a move off either end changes nothing. */
export function moveEntry(order: readonly string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return [...order];
  }
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeEntry(order: readonly string[], entry: string): string[] {
  return order.filter((e) => e !== entry);
}

/** Adds an entry at the end, where it only answers once everything above it has failed. */
export function addEntry(order: readonly string[], entry: string): string[] {
  return order.includes(entry) ? [...order] : [...order, entry];
}

/**
 * What the user could add to the list: Trakwyn AI when their plan has it, and each saved
 * key that is not listed. A provider never answers unless it is listed, so this is the
 * whole set of ways to widen the order.
 */
export function unlistedEntries(
  order: readonly string[],
  keys: readonly { provider: string }[],
  hostedAi: boolean | null,
): string[] {
  const unlisted: string[] = [];
  if (hostedAi === true && !order.includes(TRAKWYN_ENTRY)) unlisted.push(TRAKWYN_ENTRY);
  for (const { provider } of keys) {
    if (!order.includes(provider)) unlisted.push(provider);
  }
  return unlisted;
}
