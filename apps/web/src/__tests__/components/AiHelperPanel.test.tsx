import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const m = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  profileEmpty: false,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: m.request } }));
vi.mock('#/components/AiCreditsMeter', () => ({ AiCreditsMeter: () => null }));
vi.mock('#/components/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    onTrakwynAi: true,
    needsSetup: false,
    canAfford: () => true,
    costOf: () => 2,
    refresh: m.refresh,
  }),
}));
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/EmptyProfilePrompt',
  () => ({
    useIsProfileEmpty: () => m.profileEmpty,
    EmptyProfilePrompt: ({ onGenerateAnyway }: { onGenerateAnyway: () => void }) => (
      <button onClick={onGenerateAnyway} aria-label="Generate anyway" />
    ),
  }),
);

import { AiHelperPanel } from '#/routes/_authenticated/applications/$applicationId/-components/AiHelperPanel';
import type { DocumentEditorHandle } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';

const GENERATED_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
};

function makeEditor(text: string) {
  const handle: DocumentEditorHandle = {
    getText: vi.fn(() => text),
    getJson: vi.fn(() => '{"doc":true}'),
    replaceContent: vi.fn(),
    appendContent: vi.fn(),
    setEditable: vi.fn(),
  };
  return handle;
}

function api(overrides: Record<string, () => Promise<unknown>> = {}) {
  m.request.mockImplementation((query: string) => {
    for (const [name, fn] of Object.entries(overrides)) if (query.includes(name)) return fn();
    if (query.includes('PolishDocumentDraft'))
      return Promise.resolve({ polishDocumentDraft: { markdown: '# Better\n\n- one\n- two' } });
    if (query.includes('GenerateIntoDocumentDraft'))
      return Promise.resolve({
        generateIntoDocumentDraft: {
          contentJson: JSON.stringify(GENERATED_DOC),
          plainText: 'Hello',
        },
      });
    if (query.includes('query Documents'))
      return Promise.resolve({
        documents: [
          {
            id: 'f-1',
            name: 'resume.pdf',
            documentType: 'resume',
            applicationId: 'app-1',
          },
        ],
      });
    if (query.includes('query DocumentDrafts')) return Promise.resolve({ documentDrafts: [] });
    return Promise.resolve({});
  });
}

function setup({
  type = 'resume',
  plainText = '',
  editorText = plainText,
  instructions = null,
}: {
  type?: 'resume' | 'cover_letter';
  plainText?: string;
  editorText?: string;
  instructions?: string | null;
} = {}) {
  const editor = makeEditor(editorText);
  const onSave = vi.fn().mockResolvedValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (text: string) => (
    <QueryClientProvider client={client}>
      <AiHelperPanel
        draftId="draft-1"
        applicationId="app-1"
        type={type}
        plainText={text}
        initialInstructions={instructions}
        editorRef={{ current: editor }}
        onSave={onSave}
      />
    </QueryClientProvider>
  );
  const view = render(ui(plainText));
  return { editor, onSave, rerenderWithText: (text: string) => view.rerender(ui(text)) };
}

const calls = (name: string) => m.request.mock.calls.filter(([q]) => String(q).includes(name));

describe('AiHelperPanel — empty draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profileEmpty = false;
    api();
  });

  it('offers Generate, not Polish, and no regenerate', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Polish' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /regenerate from scratch/i }),
    ).not.toBeInTheDocument();
  });

  it('generates into the editor and saves it with the prompt', async () => {
    const { editor, onSave } = setup();
    fireEvent.change(screen.getByLabelText(/instructions/i), { target: { value: 'one page' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('{"doc":true}', '', 'one page'));
    expect(calls('GenerateIntoDocumentDraft')[0]![1]).toEqual({
      draftId: 'draft-1',
      instructions: 'one page',
      resumeDocumentId: null,
      resumeDraftId: null,
    });
    expect(editor.replaceContent).toHaveBeenCalledWith(GENERATED_DOC.content);
    expect(m.refresh).toHaveBeenCalled();
  });

  it('restores the last prompt', () => {
    setup({ instructions: 'be brief' });
    expect(screen.getByLabelText(/instructions/i)).toHaveValue('be brief');
  });

  it('asks about an empty profile first, and generates once told to', async () => {
    m.profileEmpty = true;
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(calls('GenerateIntoDocumentDraft')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Generate anyway' }));
    await waitFor(() => expect(calls('GenerateIntoDocumentDraft')).toHaveLength(1));
  });

  it('shows the source resume picker for a cover letter and sends the choice', async () => {
    setup({ type: 'cover_letter' });
    await waitFor(() => expect(screen.getByText('resume.pdf')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/base it on a resume/i), {
      target: { value: 'file:f-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(calls('GenerateIntoDocumentDraft')).toHaveLength(1));
    expect(calls('GenerateIntoDocumentDraft')[0]![1]).toMatchObject({
      resumeDocumentId: 'f-1',
      resumeDraftId: null,
    });
  });

  it('has no resume picker on a resume', () => {
    setup({ type: 'resume' });
    expect(screen.queryByLabelText(/base it on a resume/i)).not.toBeInTheDocument();
  });

  it('shows a credits error with its links and leaves the editor alone', async () => {
    api({
      GenerateIntoDocumentDraft: () =>
        Promise.reject({
          response: {
            errors: [
              {
                message: 'Out of credits until Dec 1.',
                extensions: { code: 'AI_CREDITS_EXHAUSTED' },
              },
            ],
          },
        }),
    });
    const { editor, onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/out of credits until dec 1/i)).toBeInTheDocument();
    expect(editor.replaceContent).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(m.refresh).toHaveBeenCalled();
  });

  it('reports an answer it cannot read instead of blanking the editor', async () => {
    api({
      GenerateIntoDocumentDraft: () =>
        Promise.resolve({ generateIntoDocumentDraft: { contentJson: 'nope', plainText: '' } }),
    });
    const { editor } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText(/could not be read/i)).toBeInTheDocument();
    expect(editor.replaceContent).not.toHaveBeenCalled();
  });
});

describe('AiHelperPanel — draft with text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profileEmpty = false;
    api();
  });

  const polish = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }));
    await screen.findByRole('region', { name: /suggested version/i });
  };

  it('offers Polish and sends the editor’s current text, unsaved edits included', async () => {
    setup({ plainText: 'saved text', editorText: 'saved text plus an unsaved edit' });
    await polish();

    expect(calls('PolishDocumentDraft')[0]![1]).toEqual({
      draftId: 'draft-1',
      plainText: 'saved text plus an unsaved edit',
      instructions: null,
    });
  });

  it('only previews: the editor is untouched until a choice is made', async () => {
    const { editor, onSave } = setup({ plainText: 'text' });
    await polish();

    expect(screen.getByRole('heading', { name: 'Better' })).toBeInTheDocument();
    expect(editor.replaceContent).not.toHaveBeenCalled();
    expect(editor.appendContent).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Replace swaps the editor’s content for the converted markdown and saves', async () => {
    const { editor, onSave } = setup({ plainText: 'text', instructions: 'tighter' });
    await polish();
    fireEvent.click(screen.getByRole('button', { name: 'Replace my text' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('{"doc":true}', 'text', 'tighter'));
    const nodes = vi.mocked(editor.replaceContent).mock.calls[0]![0];
    expect(nodes.map((n) => n.type)).toEqual(['heading', 'bulletList']);
    expect(editor.appendContent).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: /suggested version/i })).not.toBeInTheDocument();
  });

  it('Insert below appends instead of replacing, and saves', async () => {
    const { editor, onSave } = setup({ plainText: 'text' });
    await polish();
    fireEvent.click(screen.getByRole('button', { name: 'Insert below' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(editor.appendContent).toHaveBeenCalledTimes(1);
    expect(editor.replaceContent).not.toHaveBeenCalled();
  });

  it('Discard closes the preview and changes nothing', async () => {
    const { editor, onSave } = setup({ plainText: 'text' });
    await polish();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByRole('region', { name: /suggested version/i })).not.toBeInTheDocument();
    expect(editor.replaceContent).not.toHaveBeenCalled();
    expect(editor.appendContent).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks before regenerating, and does nothing on Cancel', () => {
    setup({ plainText: 'text' });
    fireEvent.click(screen.getByRole('button', { name: /regenerate from scratch/i }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/replaces everything/i);
    expect(calls('GenerateIntoDocumentDraft')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls('GenerateIntoDocumentDraft')).toHaveLength(0);
  });

  it('regenerates into the editor once confirmed', async () => {
    const { editor, onSave } = setup({ plainText: 'text' });
    fireEvent.click(screen.getByRole('button', { name: /regenerate from scratch/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace with a new draft' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(editor.replaceContent).toHaveBeenCalledWith(GENERATED_DOC.content);
  });

  it('shows why a polish failed and no preview', async () => {
    api({ PolishDocumentDraft: () => Promise.reject(new Error('rate limited')) });
    setup({ plainText: 'text' });
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /suggested version/i })).not.toBeInTheDocument();
  });
});

describe('AiHelperPanel — edits during and after a request (JEF-506)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.profileEmpty = false;
    api();
  });

  it('makes the editor read-only while a request runs, and editable again after', async () => {
    let finish: (v: unknown) => void = () => {};
    api({ PolishDocumentDraft: () => new Promise((resolve) => (finish = resolve)) });
    const { editor } = setup({ plainText: 'text' });
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }));

    await waitFor(() => expect(editor.setEditable).toHaveBeenCalledWith(false));
    expect(editor.setEditable).not.toHaveBeenCalledWith(true);

    finish({ polishDocumentDraft: { markdown: 'x' } });
    await waitFor(() => expect(editor.setEditable).toHaveBeenLastCalledWith(true));
  });

  it('restores editing when a generate fails', async () => {
    api({ GenerateIntoDocumentDraft: () => Promise.reject(new Error('down')) });
    const { editor } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(editor.setEditable).toHaveBeenLastCalledWith(true));
  });

  it('asks before generating over text typed but not yet reported by the page', () => {
    const { editor } = setup({ plainText: '', editorText: 'just typed' });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(calls('GenerateIntoDocumentDraft')).toHaveLength(0);
    expect(editor.replaceContent).not.toHaveBeenCalled();
  });

  it('chooses Polish over Generate from the live text, not the last save', () => {
    setup({ plainText: 'typed a moment ago' });
    expect(screen.getByRole('button', { name: 'Polish' })).toBeInTheDocument();
  });

  it('offers only Insert below once the draft changed after the suggestion', async () => {
    const { rerenderWithText, editor, onSave } = setup({ plainText: 'text' });
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }));
    await screen.findByRole('region', { name: /suggested version/i });
    expect(screen.getByRole('button', { name: 'Replace my text' })).toBeInTheDocument();

    rerenderWithText('text, edited meanwhile');

    expect(screen.queryByRole('button', { name: 'Replace my text' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/changed after this was written/i);
    fireEvent.click(screen.getByRole('button', { name: 'Insert below' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(editor.appendContent).toHaveBeenCalled();
    expect(editor.replaceContent).not.toHaveBeenCalled();
  });

  it('refuses to replace when the editor text differs from what was sent, even before a re-render', async () => {
    const { editor, onSave } = setup({ plainText: 'text' });
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }));
    await screen.findByRole('region', { name: /suggested version/i });

    vi.mocked(editor.getText).mockReturnValue('text plus a late edit');
    fireEvent.click(screen.getByRole('button', { name: 'Replace my text' }));

    expect(editor.replaceContent).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
