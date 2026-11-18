import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MockBackgroundPicker } from '#/features/interviews/components/mock/MockBackgroundPicker';

const { mockGqlRequest, rememberUseProfile } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
  rememberUseProfile: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));
vi.mock('#/features/interviews/lib/mockBackgroundChoice', () => ({ rememberUseProfile }));

const stamp = '2026-01-01T00:00:00.000Z';
const doc = (id: string, name: string, documentType: string) => ({
  id,
  applicationId: 'app-1',
  name,
  mimeType: 'application/pdf',
  sizeBytes: 1,
  url: 'u',
  documentType,
  createdAt: stamp,
});

function renderPicker(value = { useProfile: false, documentId: null as string | null }) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MockBackgroundPicker applicationId="app-1" value={value} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGqlRequest.mockResolvedValue({
    documents: [
      doc('r1', 'cv.pdf', 'resume'),
      doc('r2', 'cv-old.pdf', 'resume'),
      doc('c1', 'letter.pdf', 'cover_letter'),
    ],
  });
});

describe('MockBackgroundPicker', () => {
  it('says what is sent to the AI provider', () => {
    renderPicker();

    expect(
      screen.getByRole('group', { name: /What the AI may use about you/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/sent to your AI provider/)).toBeInTheDocument();
  });

  it('reflects whether the profile is in use', () => {
    renderPicker({ useProfile: true, documentId: null });

    expect(screen.getByRole('checkbox', { name: /Use my profile/ })).toBeChecked();
  });

  it('switches the profile on, keeps the chosen resume and remembers the choice', () => {
    const { onChange } = renderPicker({ useProfile: false, documentId: 'r1' });

    fireEvent.click(screen.getByRole('checkbox', { name: /Use my profile/ }));

    expect(rememberUseProfile).toHaveBeenCalledExactlyOnceWith(true);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ useProfile: true, documentId: 'r1' });
  });

  it('switches the profile off', () => {
    const { onChange } = renderPicker({ useProfile: true, documentId: null });

    fireEvent.click(screen.getByRole('checkbox', { name: /Use my profile/ }));

    expect(rememberUseProfile).toHaveBeenCalledExactlyOnceWith(false);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ useProfile: false, documentId: null });
  });

  it('offers only resume files once they load', async () => {
    renderPicker();

    await screen.findByRole('option', { name: 'cv.pdf' });
    expect(screen.getByRole('option', { name: 'cv-old.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'letter.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No resume' })).toBeInTheDocument();
  });

  it('offers no resume select when there is no resume', async () => {
    mockGqlRequest.mockResolvedValue({ documents: [doc('c1', 'letter.pdf', 'cover_letter')] });
    renderPicker();

    await vi.waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('picks a resume, and clears the pick', async () => {
    const { onChange } = renderPicker({ useProfile: true, documentId: 'r1' });
    await screen.findByRole('option', { name: 'cv.pdf' });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r2' } });
    expect(onChange).toHaveBeenLastCalledWith({ useProfile: true, documentId: 'r2' });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ useProfile: true, documentId: null });
  });
});
