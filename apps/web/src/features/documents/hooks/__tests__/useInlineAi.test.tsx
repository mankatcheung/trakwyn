import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Editor } from '@tiptap/react';

const m = vi.hoisted(() => ({
  requestPolish: vi.fn(),
  refresh: vi.fn(),
  describeBlockAt: vi.fn(),
  describeDocument: vi.fn(),
  proposalContent: vi.fn(),
  rangeText: vi.fn(),
  replaceRangeWithContent: vi.fn(),
  inlineAiInstructions: vi.fn(),
}));

vi.mock('../../graphql/polishApi', () => ({ requestPolish: m.requestPolish }));
vi.mock('#/features/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({ refresh: m.refresh }),
}));
vi.mock('#/features/documents/lib/editor/aiActions', () => ({
  inlineAiInstructions: m.inlineAiInstructions,
}));
vi.mock('#/features/documents/lib/editor/selectionRange', () => ({
  describeBlockAt: m.describeBlockAt,
  describeDocument: m.describeDocument,
  proposalContent: m.proposalContent,
  rangeText: m.rangeText,
  replaceRangeWithContent: m.replaceRangeWithContent,
}));

import { INLINE_AI_ERROR, useInlineAi } from '../useInlineAi';

const range = { from: 1, to: 6, text: 'hello', kind: 'inline' } as never;
const content = [{ type: 'paragraph' }] as never;

function setup() {
  const editor = {
    state: { doc: { content: { size: 20 } }, selection: { from: 2 } },
    getJSON: () => ({ type: 'doc' }),
    getText: () => 'plain',
  } as unknown as Editor;
  const props = {
    editor,
    draftId: 'draft-1',
    setEditable: vi.fn(),
    flush: vi.fn(),
    onApplied: vi.fn(),
    translate: (key: string) => `t:${key}`,
  };
  return { props, ...renderHook(() => useInlineAi(props)) };
}

async function toProposal(result: ReturnType<typeof setup>['result']) {
  await act(async () => {
    await result.current.run({ kind: 'preset', id: 'rewrite' } as never, range);
  });
}

describe('useInlineAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.inlineAiInstructions.mockReturnValue('do it');
    m.requestPolish.mockResolvedValue('# new');
    m.proposalContent.mockReturnValue(content);
    m.rangeText.mockReturnValue('hello');
    m.replaceRangeWithContent.mockReturnValue(true);
    m.describeBlockAt.mockReturnValue(range);
    m.describeDocument.mockReturnValue({ ...(range as object), kind: 'blocks' });
  });

  it('starts idle', () => {
    expect(setup().result.current.state).toEqual({ phase: 'idle' });
  });

  describe('run', () => {
    it('fails without a range, and sends nothing', async () => {
      const { result } = setup();
      await act(async () => result.current.run({} as never, null));
      expect(result.current.state).toEqual({
        phase: 'error',
        range: null,
        code: undefined,
        message: `t:${INLINE_AI_ERROR.selectBlocks}`,
      });
      expect(m.requestPolish).not.toHaveBeenCalled();
    });

    it('locks the editor while loading, then proposes and unlocks', async () => {
      const { result, props } = setup();
      await toProposal(result);
      expect(m.requestPolish).toHaveBeenCalledWith('draft-1', 'hello', 'do it');
      expect(props.setEditable.mock.calls).toEqual([[false], [true]]);
      expect(result.current.state).toEqual({
        phase: 'proposal',
        range,
        markdown: '# new',
        content,
      });
      expect(m.refresh).toHaveBeenCalled();
    });

    it('reports an empty proposal', async () => {
      m.proposalContent.mockReturnValue(null);
      const { result } = setup();
      await toProposal(result);
      expect(result.current.state).toMatchObject({
        phase: 'error',
        message: `t:${INLINE_AI_ERROR.emptyProposal}`,
      });
    });

    it('reports an API failure with its code and message', async () => {
      m.requestPolish.mockRejectedValue({
        response: {
          errors: [{ message: 'No credits', extensions: { code: 'AI_CREDITS_EXHAUSTED' } }],
        },
      });
      const { result, props } = setup();
      await toProposal(result);
      expect(result.current.state).toMatchObject({
        phase: 'error',
        range,
        code: 'AI_CREDITS_EXHAUSTED',
        message: expect.stringContaining('No credits'),
      });
      expect(props.setEditable).toHaveBeenLastCalledWith(true);
    });

    it('ignores an answer that arrives after the request was dismissed', async () => {
      let resolve: (v: string) => void = () => {};
      m.requestPolish.mockReturnValue(new Promise<string>((r) => (resolve = r)));
      const { result } = setup();
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.run({} as never, range);
      });
      expect(result.current.state.phase).toBe('loading');
      act(() => result.current.dismiss());
      await act(async () => {
        resolve('late');
        await pending;
      });
      expect(result.current.state).toEqual({ phase: 'idle' });
    });

    it('ignores an error that arrives after the request was dismissed', async () => {
      let reject: (e: unknown) => void = () => {};
      m.requestPolish.mockReturnValue(new Promise((_, r) => (reject = r)));
      const { result } = setup();
      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.run({} as never, range);
      });
      act(() => result.current.dismiss());
      await act(async () => {
        reject(new Error('x'));
        await pending;
      });
      expect(result.current.state).toEqual({ phase: 'idle' });
    });
  });

  describe('ask', () => {
    it('opens on the block under the cursor', () => {
      const { result } = setup();
      act(() => result.current.openAsk());
      expect(m.describeBlockAt).toHaveBeenCalledWith(expect.anything(), 2);
      expect(result.current.state).toEqual({ phase: 'ask', scope: 'block', range });
    });

    it('fails when there is no block', () => {
      m.describeBlockAt.mockReturnValue(null);
      const { result } = setup();
      act(() => result.current.openAsk());
      expect(result.current.state).toMatchObject({
        phase: 'error',
        message: `t:${INLINE_AI_ERROR.selectBlocks}`,
      });
    });

    it('switches scope between the document and the block', () => {
      const { result } = setup();
      act(() => result.current.setAskScope('document'));
      expect(result.current.state).toMatchObject({ phase: 'ask', scope: 'document' });
      act(() => result.current.setAskScope('block'));
      expect(result.current.state).toMatchObject({ phase: 'ask', scope: 'block' });
    });

    it('keeps the current state when the new scope has no range', () => {
      const { result } = setup();
      act(() => result.current.openAsk());
      m.describeDocument.mockReturnValue(null);
      act(() => result.current.setAskScope('document'));
      expect(result.current.state).toMatchObject({ phase: 'ask', scope: 'block' });
    });
  });

  describe('accept', () => {
    it('does nothing unless a proposal is showing', () => {
      const { result, props } = setup();
      act(() => result.current.accept());
      expect(props.flush).not.toHaveBeenCalled();
      expect(m.replaceRangeWithContent).not.toHaveBeenCalled();
    });

    it('flushes, replaces the range, goes idle and reports the saved document', async () => {
      const { result, props } = setup();
      await toProposal(result);
      act(() => result.current.accept());
      expect(props.flush).toHaveBeenCalled();
      expect(m.replaceRangeWithContent).toHaveBeenCalledWith(props.editor, 1, 6, content);
      expect(result.current.state).toEqual({ phase: 'idle' });
      expect(props.onApplied).toHaveBeenCalledWith('{"type":"doc"}', 'plain');
    });

    it('refuses when the text under the range changed since it was sent', async () => {
      const { result, props } = setup();
      await toProposal(result);
      m.rangeText.mockReturnValue('edited');
      act(() => result.current.accept());
      expect(m.replaceRangeWithContent).not.toHaveBeenCalled();
      expect(result.current.state).toMatchObject({
        phase: 'error',
        message: `t:${INLINE_AI_ERROR.changed}`,
      });
      expect(props.onApplied).not.toHaveBeenCalled();
    });

    it('clamps the range end to the document size when checking it', async () => {
      const { result } = setup();
      await act(async () => {
        await result.current.run({} as never, { from: 1, to: 99, text: 'hello' } as never);
      });
      act(() => result.current.accept());
      expect(m.rangeText).toHaveBeenCalledWith(expect.anything(), 1, 20);
    });

    it('reports when the replacement could not be applied', async () => {
      const { result, props } = setup();
      await toProposal(result);
      m.replaceRangeWithContent.mockReturnValue(false);
      act(() => result.current.accept());
      expect(result.current.state).toMatchObject({
        phase: 'error',
        message: `t:${INLINE_AI_ERROR.notApplied}`,
      });
      expect(props.onApplied).not.toHaveBeenCalled();
    });

    it('works without an onApplied callback', async () => {
      const { result, props } = setup();
      props.onApplied = undefined as never;
      await toProposal(result);
      act(() => result.current.accept());
      expect(result.current.state).toEqual({ phase: 'idle' });
    });
  });

  it('dismiss returns to idle', async () => {
    const { result } = setup();
    await toProposal(result);
    act(() => result.current.dismiss());
    expect(result.current.state).toEqual({ phase: 'idle' });
  });
});
