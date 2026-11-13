import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockRequest } }));

import { ImportDocumentAction } from '#/routes/_authenticated/applications/$applicationId/-components/ImportDocumentAction';
import type { DocumentEditorHandle } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';

const DOCS = [
  { id: 'd-1', name: 'old-cv.pdf', documentType: 'resume' },
  { id: 'd-2', name: 'notes.docx', documentType: 'other' },
];

function api(extract: () => Promise<unknown>, documents = DOCS) {
  mockRequest.mockImplementation((query: string) =>
    query.includes('ExtractDocumentText') ? extract() : Promise.resolve({ documents }),
  );
}

function setup() {
  const editor: DocumentEditorHandle = {
    getText: vi.fn(() => 'Line one\n\nLine two'),
    getJson: vi.fn(() => '{"on":"screen"}'),
    replaceContent: vi.fn(),
    appendContent: vi.fn(),
    focusBlock: vi.fn(),
    setEditable: vi.fn(),
  };
  const onSave = vi.fn().mockResolvedValue(true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ImportDocumentAction applicationId="app-1" editorRef={{ current: editor }} onSave={onSave} />
    </QueryClientProvider>,
  );
  return { editor, onSave };
}

const choose = async (id: string) => {
  const select = await screen.findByRole('combobox');
  await screen.findByText('old-cv.pdf (resume)');
  fireEvent.change(select, { target: { value: id } });
};
const importButton = () => screen.getByRole('button', { name: 'Import' });

describe('ImportDocumentAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the application documents with their type', async () => {
    api(() => Promise.resolve({}));
    setup();
    expect(await screen.findByText('old-cv.pdf (resume)')).toBeInTheDocument();
    expect(screen.getByText('notes.docx (other)')).toBeInTheDocument();
  });

  it('renders nothing when the application has no documents', async () => {
    api(() => Promise.resolve({}), []);
    setup();
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining('Documents'),
        expect.anything(),
      ),
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('cannot import until a document is chosen', async () => {
    api(() => Promise.resolve({}));
    setup();
    await screen.findByRole('combobox');
    expect(importButton()).toBeDisabled();
  });

  it('extracts the text, loads it into the editor and saves it', async () => {
    api(() => Promise.resolve({ extractDocumentText: { text: 'Line one\n\nLine two' } }));
    const { editor, onSave } = setup();
    await choose('d-1');
    fireEvent.click(importButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('{"on":"screen"}', 'Line one\n\nLine two'),
    );
    expect(mockRequest).toHaveBeenCalledWith(expect.stringContaining('ExtractDocumentText'), {
      documentId: 'd-1',
    });
    const nodes = vi.mocked(editor.replaceContent).mock.calls[0]![0];
    expect(nodes[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'Line one' }] });
    expect(editor.setEditable).toHaveBeenNthCalledWith(1, false);
    expect(editor.setEditable).toHaveBeenLastCalledWith(true);
  });

  it('tells the user when the document has no text, and leaves the editor alone', async () => {
    api(() => Promise.resolve({ extractDocumentText: { text: '   ' } }));
    const { editor, onSave } = setup();
    await choose('d-1');
    fireEvent.click(importButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/no readable text/i);
    expect(editor.replaceContent).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(editor.setEditable).toHaveBeenLastCalledWith(true);
  });

  it('shows why the extraction failed', async () => {
    api(() =>
      Promise.reject({
        response: {
          errors: [{ message: 'Unsupported file', extensions: { code: 'VALIDATION_ERROR' } }],
        },
      }),
    );
    const { editor } = setup();
    await choose('d-1');
    fireEvent.click(importButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported file/i);
    expect(editor.replaceContent).not.toHaveBeenCalled();
    expect(editor.setEditable).toHaveBeenLastCalledWith(true);
  });

  it('says so when the imported text could not be saved', async () => {
    api(() => Promise.resolve({ extractDocumentText: { text: 'abc' } }));
    const { onSave } = setup();
    onSave.mockResolvedValue(false);
    await choose('d-1');
    fireEvent.click(importButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
  });
});
