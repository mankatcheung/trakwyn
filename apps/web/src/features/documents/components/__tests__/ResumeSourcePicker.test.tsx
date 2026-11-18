import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResumeSourcePicker } from '#/features/documents/components/ResumeSourcePicker';
import { gqlText } from '#/__tests__/helpers/gqlText';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

const stamp = '2026-01-01T00:00:00.000Z';
const documents = [
  {
    id: 'f1',
    applicationId: 'app-1',
    name: 'cv.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1,
    url: 'u',
    documentType: 'resume',
    createdAt: stamp,
  },
  {
    id: 'f2',
    applicationId: 'app-1',
    name: 'letter.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1,
    url: 'u',
    documentType: 'cover_letter',
    createdAt: stamp,
  },
];
const drafts = [
  {
    id: 'd1',
    applicationId: 'app-1',
    type: 'resume',
    title: 'Draft one',
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 'd2',
    applicationId: 'app-1',
    type: 'resume',
    title: 'Draft two',
    createdAt: stamp,
    updatedAt: stamp,
  },
  {
    id: 'd3',
    applicationId: 'app-1',
    type: 'cover_letter',
    title: 'A letter',
    createdAt: stamp,
    updatedAt: stamp,
  },
];

function serve(docs = documents, dr = drafts) {
  mockGqlRequest.mockImplementation((doc: unknown) =>
    Promise.resolve(
      gqlText(doc).includes('DocumentDrafts') ? { documentDrafts: dr } : { documents: docs },
    ),
  );
}

function renderPicker(props: Partial<Parameters<typeof ResumeSourcePicker>[0]> = {}) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ResumeSourcePicker applicationId="app-1" value="" onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return { onChange };
}

const select = () => screen.getByRole('combobox');

beforeEach(() => {
  vi.clearAllMocks();
  serve();
});

describe('ResumeSourcePicker', () => {
  it('offers only the none option until the resumes load', () => {
    renderPicker();

    expect(select().querySelectorAll('option')).toHaveLength(1);
  });

  it('groups resume files and resume drafts, leaving out other categories', async () => {
    renderPicker();

    await screen.findByRole('option', { name: 'cv.pdf' });
    expect(screen.getByRole('option', { name: 'Draft one' })).toHaveValue('draft:d1');
    expect(screen.getByRole('option', { name: 'cv.pdf' })).toHaveValue('file:f1');
    expect(screen.queryByRole('option', { name: 'letter.pdf' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'A letter' })).not.toBeInTheDocument();
  });

  it('leaves out the draft being edited', async () => {
    renderPicker({ excludeDraftId: 'd1' });

    await screen.findByRole('option', { name: 'Draft two' });
    expect(screen.queryByRole('option', { name: 'Draft one' })).not.toBeInTheDocument();
  });

  it('shows no group when there is nothing to put in it', async () => {
    serve([], []);
    renderPicker();

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledTimes(2));
    expect(select().querySelectorAll('optgroup')).toHaveLength(0);
  });

  it('reports the chosen source', async () => {
    const { onChange } = renderPicker();
    await screen.findByRole('option', { name: 'cv.pdf' });

    fireEvent.change(select(), { target: { value: 'draft:d2' } });

    expect(onChange).toHaveBeenCalledExactlyOnceWith('draft:d2');
  });

  it('can be disabled', () => {
    renderPicker({ disabled: true });

    expect(select()).toBeDisabled();
  });
});
