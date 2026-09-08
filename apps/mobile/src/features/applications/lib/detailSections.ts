/** Sub-screens reachable from the application detail pill tab bar, keyed by their relative route. */
export const DETAIL_SECTION_ROUTES = {
  notes: './notes',
  interviews: './interviews',
  documents: './documents',
} as const;

export type DetailSectionKey = keyof typeof DETAIL_SECTION_ROUTES;
