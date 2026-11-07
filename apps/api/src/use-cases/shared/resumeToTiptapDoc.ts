import type { ResumeContact, ResumeContent } from '#src/domain/resume/ResumeContent.js';

type Node = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
};

const text = (value: string): Node => ({ type: 'text', text: value });
const paragraph = (value?: string): Node =>
  value && value.trim().length > 0
    ? { type: 'paragraph', content: [text(value)] }
    : { type: 'paragraph' };
const heading = (level: number, value: string): Node => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const bullets = (items: string[]): Node[] =>
  items.filter((i) => i.trim().length > 0).length > 0
    ? [
        {
          type: 'bulletList',
          content: items
            .filter((i) => i.trim().length > 0)
            .map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
        },
      ]
    : [];

/**
 * Renders a generated resume as the ProseMirror document the draft editor
 * stores in `DocumentDraft.contentJson`.
 *
 * Headings and bullet lists rather than flat paragraphs: the editor runs
 * Tiptap's StarterKit, which supports both, and a resume flattened to prose
 * loses the structure that makes it a resume (JEF-199).
 *
 * Empty paragraphs carry no `content` array — an empty ProseMirror text node
 * is invalid and makes the editor throw when it loads the draft.
 */
export function resumeToTiptapDoc(
  resume: ResumeContent,
  contact?: ResumeContact,
): {
  contentJson: string;
  plainText: string;
} {
  const nodes: Node[] = [];
  const lines: string[] = [];

  // The contact header is built in code, never by the model (JEF-526). Either
  // part is skipped when empty, so there is never an empty heading or text node.
  const name = contact?.name?.trim();
  if (name) {
    nodes.push(heading(1, name));
    lines.push(name);
  }
  const contactLine = [contact?.email, ...(contact?.details ?? [])]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' | ');
  if (contactLine) {
    nodes.push(paragraph(contactLine));
    lines.push(contactLine);
  }
  if (lines.length > 0) lines.push('');

  if (resume.summary?.trim()) {
    nodes.push(heading(1, 'Summary'), paragraph(resume.summary));
    lines.push('Summary', resume.summary);
  }

  if (resume.experience.length > 0) {
    nodes.push(heading(1, 'Experience'));
    lines.push('', 'Experience');
    for (const role of resume.experience) {
      const title = role.period
        ? `${role.title} — ${role.company} (${role.period})`
        : `${role.title} — ${role.company}`;
      nodes.push(heading(2, title), ...bullets(role.bullets));
      lines.push(title, ...role.bullets.map((b) => `- ${b}`));
    }
  }

  if (resume.education.length > 0) {
    nodes.push(heading(1, 'Education'));
    lines.push('', 'Education');
    for (const entry of resume.education) {
      const parts = [entry.qualification, entry.institution, entry.period].filter(Boolean);
      nodes.push(paragraph(parts.join(' — ')));
      lines.push(parts.join(' — '));
    }
  }

  if (resume.skills.length > 0) {
    nodes.push(heading(1, 'Skills'));
    lines.push('', 'Skills');
    for (const group of resume.skills) {
      const line = `${group.category}: ${group.items.join(', ')}`;
      nodes.push(paragraph(line));
      lines.push(line);
    }
  }

  // A ProseMirror doc may not be empty.
  if (nodes.length === 0) nodes.push(paragraph());

  return {
    contentJson: JSON.stringify({ type: 'doc', content: nodes }),
    plainText: lines.join('\n').trim(),
  };
}
