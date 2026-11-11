import { describe, it, expect } from 'vitest';
import { DocumentDraftMapper } from '#src/interface-adapters/mappers/DocumentDraftMapper.js';
import { makeDocumentDraft } from '#src/__tests__/helpers/mocks/documents.js';
import { makeAiGeneration } from '#src/__tests__/helpers/mocks/aiFeedback.js';

describe('DocumentDraftMapper (JEF-547)', () => {
  const mapper = new DocumentDraftMapper();

  it('says a draft was AI-generated when it has a generation, so it can be rated', () => {
    expect(mapper.toDTO(makeDocumentDraft({ generation: makeAiGeneration() })).aiGenerated).toBe(
      true,
    );
    expect(mapper.toDTO(makeDocumentDraft({ generation: null })).aiGenerated).toBe(false);
  });

  it('does not expose which model wrote it', () => {
    const dto = mapper.toDTO(makeDocumentDraft({ generation: makeAiGeneration() })) as object;

    expect('generation' in dto).toBe(false);
  });
});
