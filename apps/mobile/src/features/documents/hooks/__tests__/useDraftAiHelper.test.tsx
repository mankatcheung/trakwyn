import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../useDocumentDraftAi', () => ({
  usePolishDocumentDraft: jest.fn(),
  useGenerateIntoDocumentDraft: jest.fn(),
}));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));

import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import { useGenerateIntoDocumentDraft, usePolishDocumentDraft } from '../useDocumentDraftAi';
import { useDraftAiHelper } from '../useDraftAiHelper';

const refresh = jest.fn();
const polishAsync = jest.fn();
const generateAsync = jest.fn();
const save = jest.fn();
const setText = jest.fn();
let current = 'my draft';

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function setup(type: 'resume' | 'cover_letter' = 'cover_letter') {
  return renderHook(
    () =>
      useDraftAiHelper({
        draftId: 'd1',
        type,
        getText: () => current,
        setText,
        saver: { save } as never,
      }),
    { wrapper },
  );
}

describe('useDraftAiHelper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    current = 'my draft';
    save.mockResolvedValue(true);
    jest.mocked(useAiCredits).mockReturnValue({ refresh } as never);
    jest
      .mocked(usePolishDocumentDraft)
      .mockReturnValue({ mutateAsync: polishAsync, isPending: false } as never);
    jest
      .mocked(useGenerateIntoDocumentDraft)
      .mockReturnValue({ mutateAsync: generateAsync, isPending: false } as never);
  });

  it('generate fills the editor, saves the result with the prompt and refreshes credits', async () => {
    generateAsync.mockResolvedValueOnce({ contentJson: '{"doc":1}', plainText: 'Dear Sir' });
    const { result } = await setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.generate('  warm tone ', { kind: 'draft', id: 'r1' });
    });

    expect(ok).toBe(true);
    expect(generateAsync).toHaveBeenCalledWith({
      draftId: 'd1',
      instructions: 'warm tone',
      resumeDocumentId: null,
      resumeDraftId: 'r1',
    });
    expect(setText).toHaveBeenCalledWith('Dear Sir');
    expect(save).toHaveBeenCalledWith({
      contentJson: '{"doc":1}',
      plainText: 'Dear Sir',
      aiInstructions: 'warm tone',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('never sends a resume source for a resume', async () => {
    generateAsync.mockResolvedValueOnce({ contentJson: '{}', plainText: 'x' });
    const { result } = await setup('resume');
    await act(async () => {
      await result.current.generate('', { kind: 'file', id: 'f1' });
    });
    expect(generateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: null, resumeDocumentId: null, resumeDraftId: null }),
    );
  });

  it('a failed generate leaves the editor alone and reports why', async () => {
    generateAsync.mockRejectedValueOnce({
      response: {
        errors: [{ message: 'Out of credits', extensions: { code: 'AI_CREDITS_EXHAUSTED' } }],
      },
    });
    const { result } = await setup();
    await act(async () => {
      expect(await result.current.generate('', null)).toBe(false);
    });
    expect(result.current.failure).toBe('Out of credits');
    expect(setText).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('polish holds a suggestion and changes nothing', async () => {
    polishAsync.mockResolvedValueOnce('# Better');
    const { result } = await setup();
    await act(async () => result.current.polish('shorter'));

    expect(polishAsync).toHaveBeenCalledWith({
      draftId: 'd1',
      plainText: 'my draft',
      instructions: 'shorter',
    });
    expect(result.current.suggestion).toEqual({ markdown: '# Better', sourceText: 'my draft' });
    expect(setText).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('replace swaps the text and saves it with the prompt', async () => {
    polishAsync.mockResolvedValueOnce('Better text');
    const { result } = await setup();
    await act(async () => result.current.polish(''));
    await act(async () => result.current.replace('shorter'));

    expect(setText).toHaveBeenCalledWith('Better text');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ plainText: 'Better text', aiInstructions: 'shorter' }),
    );
    expect(result.current.suggestion).toBeNull();
  });

  it('refuses to replace text that changed since the suggestion, but can insert below', async () => {
    polishAsync.mockResolvedValueOnce('Better text');
    const { result } = await setup();
    await act(async () => result.current.polish(''));
    current = 'my draft plus new edits';

    await act(async () => result.current.replace(''));
    expect(setText).not.toHaveBeenCalled();
    expect(result.current.suggestion).not.toBeNull();

    await act(async () => result.current.insertBelow(''));
    expect(setText).toHaveBeenCalledWith('my draft plus new edits\n\nBetter text');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ plainText: 'my draft plus new edits\n\nBetter text' }),
    );
  });

  it('discard drops the suggestion without touching the draft', async () => {
    polishAsync.mockResolvedValueOnce('Better');
    const { result } = await setup();
    await act(async () => result.current.polish(''));
    await act(async () => result.current.discard());
    expect(result.current.suggestion).toBeNull();
    expect(setText).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
