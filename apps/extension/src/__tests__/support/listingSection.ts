/** The text under a heading, up to the next heading of the same or a higher level. */
export function listingSection(listing: string, heading: string): string {
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  const lines = listing.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`listing has no "${heading}" section`);
  const end = lines.findIndex((line, i) => {
    const hashes = i > start ? line.match(/^(#+) /)?.[1].length : undefined;
    return hashes !== undefined && hashes <= level;
  });
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}
