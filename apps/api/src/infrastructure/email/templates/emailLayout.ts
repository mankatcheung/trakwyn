/**
 * The one layout every transactional email is built on (JEF-687). Email-safe
 * on purpose: inline styles, tables for the outer frame and the button, no
 * gradients, no CSS variables, a system font stack and light colours only
 * (forced dark mode in Gmail and Apple Mail still reads well because every
 * surface has an explicit background).
 */

export const EMAIL_COLORS = {
  page: '#fafaf9',
  card: '#ffffff',
  border: '#e7e5e4',
  text: '#1c1917',
  secondary: '#57534e',
  muted: '#78716c',
  accent: '#1e40af',
  danger: '#b91c1c',
  onAccent: '#ffffff',
} as const;

export const EMAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value that came from a user, a device or a third party. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export interface EmailLayoutInput {
  title: string;
  /** Hidden text some clients show beside the subject line. */
  preheader?: string;
  bodyHtml: string;
}

export function renderEmail({ title, preheader, bodyHtml }: EmailLayoutInput): string {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${EMAIL_COLORS.page};">${escapeHtml(preheader)}</div>\n`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:${EMAIL_COLORS.page};font-family:${EMAIL_FONT};">
${hidden}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.page}" style="background-color:${EMAIL_COLORS.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${EMAIL_COLORS.card}" style="width:100%;max-width:600px;background-color:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:8px;">
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:13px;font-weight:500;color:${EMAIL_COLORS.muted};">Trakwyn</p>
            <h1 style="margin:0 0 20px;font-size:22px;font-weight:500;line-height:1.3;color:${EMAIL_COLORS.text};">${escapeHtml(title)}</h1>
${bodyHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:${EMAIL_COLORS.secondary};">${html}</p>`;
}

export function emailFootnote(html: string): string {
  return `<p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_COLORS.muted};">${html}</p>`;
}

/** A solid button that survives Outlook: bgcolor on the cell, no gradients. */
export function emailButton(
  url: string,
  label: string,
  color: string = EMAIL_COLORS.accent,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px;">
  <tr>
    <td align="center" bgcolor="${color}" style="background-color:${color};border-radius:6px;">
      <a href="${url}" style="display:inline-block;padding:12px 28px;font-family:${EMAIL_FONT};font-size:14px;font-weight:500;color:${EMAIL_COLORS.onAccent};text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}
