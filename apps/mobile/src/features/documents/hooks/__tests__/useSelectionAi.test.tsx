import { act, renderHook } from '@testing-library/react-native';
import '../../../../i18n';
import { getErrorMessage } from '../../../../lib/errors';

jest.mock('../useDocumentDraftAi', () => ({ usePolishDocumentDraft: jest.fn() }));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));

import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import { usePolishDocumentDraft } from '../useDocumentDraftAi';
import { useSelectionAi } from '../useSelectionAi';

const refresh = jest.fn();
const polishAsync = jest.fn();
const applyEdit = jest.fn();
let current = 'Intro. A weak sentence here. Outro.';
// "A weak sentence here." in `current`
const SEL = { start: 7, end: 28 };

function setup() {
  return renderHook(() => useSelectionAi({ draftId: 'd1', getText: () => current, applyEdit }));
}

describe('useSelectionAi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    current = 'Intro. A weak sentence here. Outro.';
    jest.mocked(useAiCredits).mockReturnValue({ refresh } as never);
    jest
      .mocked(usePolishDocumentDraft)
      .mockReturnValue({ mutateAsync: polishAsync, isPending: false } as never);
  });

  it('sends only the selected text with the preset and holds the answer as a proposal', async () => {
    polishAsync.mockResolvedValueOnce('A strong sentence.\n');
    const { result } = await setup();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'rewrite' }, SEL);
    });

    expect(polishAsync).toHaveBeenCalledWith({
      draftId: 'd1',
      plainText: 'A weak sentence here.',
      instructions: expect.stringContaining('Rewrite this text'),
    });
    expect(result.current.state).toMatchObject({
      phase: 'proposal',
      markdown: 'A strong sentence.',
    });
    expect(applyEdit).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('accept replaces only the selected range', async () => {
    polishAsync.mockResolvedValueOnce('A strong sentence.');
    const { result } = await setup();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'rewrite' }, SEL);
    });
    await act(async () => result.current.accept());

    expect(applyEdit).toHaveBeenCalledWith({
      text: 'Intro. A strong sentence. Outro.',
      selection: { start: 25, end: 25 },
    });
    expect(result.current.state.phase).toBe('idle');
  });

  it('dismiss leaves the text untouched', async () => {
    polishAsync.mockResolvedValueOnce('Other.');
    const { result } = await setup();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'shorten' }, SEL);
    });
    await act(async () => result.current.dismiss());

    expect(applyEdit).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  it('refuses a result when the selected text changed meanwhile', async () => {
    polishAsync.mockImplementationOnce(async () => {
      current = 'Intro. A weak sentence there. Outro.';
      return 'A strong sentence.';
    });
    const { result } = await setup();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'rewrite' }, SEL);
    });

    expect(result.current.state).toMatchObject({ phase: 'error', changed: true });
    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('refuses to accept when the text changed after the proposal arrived', async () => {
    polishAsync.mockResolvedValueOnce('A strong sentence.');
    const { result } = await setup();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'rewrite' }, SEL);
    });
    current = 'Changed. A weak sentence here. Outro.';
    await act(async () => result.current.accept());

    expect(result.current.state).toMatchObject({ phase: 'error', changed: true });
    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('shows the API error message and ignores an empty selection', async () => {
    const failure = new Error('Rate limited');
    polishAsync.mockRejectedValueOnce(failure);
    const { result } = await setup();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'grammar' }, { start: 3, end: 3 });
    });
    expect(polishAsync).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.run({ kind: 'preset', action: 'grammar' }, SEL);
    });
    expect(result.current.state).toMatchObject({ phase: 'error', changed: false });
    // The same message the AI sheet shows for the same failure.
    expect((result.current.state as { message: string }).message).toBe(getErrorMessage(failure));
  });

  it('ignores the answer of a dismissed request', async () => {
    let resolve: (v: string) => void = () => {};
    polishAsync.mockReturnValueOnce(new Promise<string>((r) => (resolve = r)));
    const { result } = await setup();
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.run({ kind: 'preset', action: 'rewrite' }, SEL);
    });
    expect(result.current.running).toBe(true);
    await act(async () => result.current.dismiss());
    await act(async () => {
      resolve('late');
      await pending;
    });
    expect(result.current.state.phase).toBe('idle');
  });
});
