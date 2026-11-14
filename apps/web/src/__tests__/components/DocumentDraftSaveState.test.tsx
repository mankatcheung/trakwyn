import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RefObject } from 'react';
import type { SaveStatus } from '#/lib/editor/saveState';

const { mockGqlRequest, mockUseBlocker } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  mockUseBlocker: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => ({
    ...opts,
    useParams: () => ({ applicationId: 'app-1', draftId: 'draft-1' }),
  }),
  useNavigate: () => vi.fn(),
  useBlocker: mockUseBlocker,
}));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/lib/downloadUrl', () => ({ downloadUrl: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('#/routes/_authenticated/applications/$applicationId/-components/AiHelperPanel', () => ({
  AiHelperPanel: () => null,
}));
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/ImportDocumentAction',
  () => ({ ImportDocumentAction: () => null }),
);
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorChecks',
  () => ({ DocumentEditorChecks: () => null }),
);

// What is on screen in the stand-in editor, which Retry must send.
let onScreen = 'first';

// A stand-in editor: typing reports a change, the pause hands the content to the
// page's `onUpdate` (the real editor does that after its 1 s debounce).
vi.mock(
  '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor',
  () => ({
    DocumentDraftEditor: ({
      onUpdate,
      onTextChange,
      editorRef,
      saveStatus,
    }: {
      onUpdate: (json: string, text: string) => void;
      onTextChange: (text: string) => void;
      editorRef?: RefObject<{ getJson: () => string; getText: () => string } | null>;
      saveStatus: SaveStatus;
    }) => {
      if (editorRef)
        editorRef.current = { getJson: () => `{"t":"${onScreen}"}`, getText: () => onScreen };
      return (
        <div>
          <button onClick={() => onTextChange(onScreen)}>type</button>
          <button onClick={() => onUpdate(`{"t":"${onScreen}"}`, onScreen)}>pause</button>
          <output data-testid="state">{saveStatus.state}</output>
          <output data-testid="message">{saveStatus.errorMessage ?? ''}</output>
          <button onClick={saveStatus.onRetry}>retry</button>
        </div>
      );
    },
  }),
);

import { Route } from '#/routes/_authenticated/applications/$applicationId/documents/$draftId';

const Page = (Route as unknown as { component: () => React.JSX.Element }).component;

const DRAFT = {
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'resume',
  title: 'My Resume',
  contentJson: '{}',
  plainText: '',
  sourceDocumentId: null,
  aiInstructions: null,
  aiGenerated: false,
  myRating: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const saves = () =>
  mockGqlRequest.mock.calls.filter(([q]) => String(q).includes('UpdateDocumentDraftContent'));
const state = () => screen.getByTestId('state').textContent;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

function mockApi(save: () => Promise<unknown>) {
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('query DocumentDraft')) return Promise.resolve({ documentDraft: DRAFT });
    if (query.includes('UpdateDocumentDraftContent')) return save();
    return Promise.resolve({});
  });
}

async function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Page />
    </QueryClientProvider>,
  );
  await screen.findByTestId('state');
}

const lastBlocker = () =>
  mockUseBlocker.mock.calls.at(-1)![0] as {
    shouldBlockFn: () => boolean;
    disabled: boolean;
    enableBeforeUnload: boolean;
  };

describe('DocumentDraftEditPage — save state (JEF-577)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onScreen = 'first';
  });

  it('goes Saved → Unsaved → Saving → Saved around a save', async () => {
    let finish: (v: unknown) => void = () => {};
    mockApi(() => new Promise((resolve) => (finish = resolve)));
    await renderPage();
    expect(state()).toBe('saved');

    click('type');
    expect(state()).toBe('dirty');

    click('pause');
    expect(state()).toBe('saving');
    // The queue reaches the request a microtask later.
    await waitFor(() => expect(saves()).toHaveLength(1));

    await act(async () => finish({ updateDocumentDraftContent: { id: 'draft-1' } }));
    await waitFor(() => expect(state()).toBe('saved'));
  });

  it("shows Couldn't save with the API's message when the save fails", async () => {
    mockApi(() =>
      Promise.reject({
        response: {
          errors: [{ message: 'Session expired', extensions: { code: 'UNAUTHORIZED' } }],
        },
      }),
    );
    await renderPage();
    click('type');
    click('pause');

    await waitFor(() => expect(state()).toBe('error'));
    expect(screen.getByTestId('message').textContent).toBe('Session expired');
  });

  it('keeps showing Unsaved changes when typing continues after a failure', async () => {
    mockApi(() => Promise.reject(new Error('offline')));
    await renderPage();
    click('type');
    click('pause');
    await waitFor(() => expect(state()).toBe('error'));

    click('type');
    expect(state()).toBe('dirty');
  });

  it('Retry sends the content on screen now, not the failed attempt', async () => {
    let fail = true;
    mockApi(() =>
      fail
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ updateDocumentDraftContent: {} }),
    );
    await renderPage();
    click('type');
    click('pause');
    await waitFor(() => expect(state()).toBe('error'));

    onScreen = 'second';
    fail = false;
    click('retry');

    await waitFor(() => expect(state()).toBe('saved'));
    const sent = saves().map(([, vars]) => (vars as { input: { plainText: string } }).input);
    expect(sent.map((i) => i.plainText)).toEqual(['first', 'second']);
  });

  it('asks before leaving while changes are unsaved, failed or saving, and not once saved', async () => {
    mockApi(() => Promise.reject(new Error('offline')));
    await renderPage();
    expect(lastBlocker().disabled).toBe(true);
    expect(lastBlocker().enableBeforeUnload).toBe(false);

    click('type');
    expect(lastBlocker().disabled).toBe(false);
    expect(lastBlocker().enableBeforeUnload).toBe(true);

    click('pause');
    await waitFor(() => expect(state()).toBe('error'));
    expect(lastBlocker().disabled).toBe(false);
  });

  it('is quiet again after a successful save', async () => {
    mockApi(() => Promise.resolve({ updateDocumentDraftContent: { id: 'draft-1' } }));
    await renderPage();
    click('type');
    click('pause');
    await waitFor(() => expect(state()).toBe('saved'));
    expect(lastBlocker().disabled).toBe(true);
  });

  it('blocks in-app navigation only when the user declines the prompt', async () => {
    mockApi(() => Promise.resolve({}));
    await renderPage();
    click('type');
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValueOnce(false);
    expect(lastBlocker().shouldBlockFn()).toBe(true);
    confirm.mockReturnValueOnce(true);
    expect(lastBlocker().shouldBlockFn()).toBe(false);
    confirm.mockRestore();
  });
});
