/**
 * The AAD both sides of `ILlmApiKeyCipher` agree on: a key is sealed to the
 * (user, provider) row it lives in, so the same ciphertext pasted into
 * another row fails to decrypt rather than spending someone else's key.
 * One function so the two callers cannot drift apart.
 */
export function llmApiKeyCipherContext(userId: string, provider: string): string {
  return `${userId}:${provider}`;
}
