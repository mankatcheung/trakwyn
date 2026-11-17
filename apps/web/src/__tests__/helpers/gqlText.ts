/**
 * Text a `gqlClient.request` mock can match on. A typed document (`graphql()`)
 * is an AST, a not-yet-converted one is still a string, so a mock that did
 * `query.includes('MyOffers')` cannot assume either. For an AST this returns
 * `query Name` / `mutation Name` followed by the JSON, which carries every
 * field name, so the old substring checks keep working.
 */
export function gqlText(document: unknown): string {
  if (typeof document === 'string') return document;
  const definitions =
    (document as { definitions?: { operation?: string; name?: { value: string } }[] })
      ?.definitions ?? [];
  const heads = definitions.map((d) => `${d.operation ?? ''} ${d.name?.value ?? ''}`.trim());
  return `${heads.join('\n')}\n${JSON.stringify(document)}`;
}
