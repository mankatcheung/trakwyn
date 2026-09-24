/**
 * Asks the browser to download the file at `url`, saved as `fileName`.
 *
 * `download` is only honoured for same-origin URLs; storage URLs are usually
 * signed links on another origin, so `target="_blank"` makes those open in a
 * new tab instead of replacing the current page (and losing editor state).
 */
export function downloadUrl(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
