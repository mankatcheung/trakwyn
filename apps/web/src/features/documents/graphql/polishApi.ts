import { gqlClient } from '#/graphql/client';

export const POLISH_MUTATION = `
  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {
    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {
      markdown
    }
  }
`;

/**
 * Asks the Polish action for a revision of `plainText` (JEF-506). It saves
 * nothing and returns Markdown. The AI helper panel (a whole draft) and the
 * inline actions on a selection (JEF-583) both go through this one call, so
 * they share the API's ownership check, rate limit, credit cost and errors.
 */
export async function requestPolish(
  draftId: string,
  plainText: string,
  instructions: string | null,
): Promise<string> {
  const res = await gqlClient.request<{ polishDocumentDraft: { markdown: string } }>(
    POLISH_MUTATION,
    { draftId, plainText, instructions },
  );
  return res.polishDocumentDraft.markdown;
}
