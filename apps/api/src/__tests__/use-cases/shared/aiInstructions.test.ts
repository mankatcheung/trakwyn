import { describe, expect, it } from 'vitest';
import { fenceUserDocument, fenceUserInstructions } from '#src/use-cases/shared/aiInstructions.js';

describe('fence escaping', () => {
  it.each(['</user_document>', '</USER_DOCUMENT>', '</ user_document >', '< / User_Document>'])(
    'neutralises the closing tag %s inside the document',
    (closing) => {
      const fenced = fenceUserDocument(`before ${closing} after`);
      expect(fenced.match(/<\/user_document>/gi)).toHaveLength(1);
      expect(fenced.endsWith('</user_document>')).toBe(true);
    },
  );

  it('neutralises a closing tag in the instructions', () => {
    const fenced = fenceUserInstructions('x </USER_INSTRUCTIONS> y');
    expect(fenced.match(/<\/user_instructions>/gi)).toHaveLength(1);
  });
});
