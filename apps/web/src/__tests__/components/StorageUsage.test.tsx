import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('@vercel/blob/client', () => ({ put: vi.fn() }));

vi.mock('#/lib/analytics', () => ({
  ANALYTICS_EVENTS: { DOCUMENT_UPLOADED: 'document_uploaded' },
  captureException: vi.fn(),
  captureEvent: vi.fn(),
}));

import { StorageCard } from '#/routes/_authenticated/settings/-components/StorageCard';
import { DocumentUploadPanel } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentUploadPanel';
import {
  formatMegabytes,
  formatStorageSize,
  storageLevel,
  storagePercent,
} from '#/lib/storageUsage';

const MB = 1024 * 1024;

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const withUsage = (usedMb: number, limitMb = 100) =>
  mockGqlRequest.mockImplementation((query: string) => {
    if (query.includes('StorageUsage')) {
      return Promise.resolve({
        me: { storageUsedBytes: usedMb * MB, storageLimitBytes: limitMb * MB },
      });
    }
    return Promise.reject({
      response: {
        errors: [
          {
            message: 'Document storage is full: 100 MB of 100 MB used',
            extensions: { code: 'QUOTA_EXCEEDED' },
          },
        ],
      },
    });
  });

describe('storageLevel', () => {
  it('is ok below 80%, warning from 80%, full at the limit', () => {
    const limitBytes = 100 * MB;
    expect(storageLevel({ usedBytes: 79 * MB, limitBytes })).toBe('ok');
    expect(storageLevel({ usedBytes: 80 * MB, limitBytes })).toBe('warning');
    expect(storageLevel({ usedBytes: 99 * MB, limitBytes })).toBe('warning');
    expect(storageLevel({ usedBytes: 100 * MB, limitBytes })).toBe('full');
    expect(storageLevel({ usedBytes: 120 * MB, limitBytes })).toBe('full');
  });

  it('reads 100% only when the account is full, never from rounding', () => {
    const limitBytes = 100 * MB;
    expect(storagePercent({ usedBytes: 99.6 * MB, limitBytes })).toBe(99);
    expect(storagePercent({ usedBytes: 100 * MB, limitBytes })).toBe(100);
    expect(storagePercent({ usedBytes: 150 * MB, limitBytes })).toBe(100);
  });

  it('switches to gigabytes from 1 GB, so a Pro limit reads 2 GB and not 2048 MB (JEF-344)', () => {
    const GB = 1024 * MB;
    expect(formatStorageSize(2 * GB)).toBe('2 GB');
    expect(formatStorageSize(1.5 * GB)).toBe('1.5 GB');
    expect(formatStorageSize(GB)).toBe('1 GB');
    expect(formatStorageSize(1023 * MB)).toBe('1023 MB');
    expect(formatStorageSize(100 * MB)).toBe('100 MB');
  });

  it('formats megabytes with at most one decimal', () => {
    expect(formatMegabytes(100 * MB)).toBe('100 MB');
    expect(formatMegabytes(12.46 * MB)).toBe('12.5 MB');
  });
});

describe('StorageCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows used of limit with a progress bar', async () => {
    withUsage(25);
    render(<StorageCard />, { wrapper: Wrapper });

    expect(await screen.findByText('25 MB of 100 MB used (25%)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(25 * MB));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns at 80%', async () => {
    withUsage(80);
    render(<StorageCard />, { wrapper: Wrapper });

    expect(await screen.findByRole('status')).toHaveTextContent(/close to your storage limit/i);
  });

  it('shows the full state at 100%', async () => {
    withUsage(100);
    render(<StorageCard />, { wrapper: Wrapper });

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/i);
  });

  it('renders nothing when the API sends no usage', async () => {
    mockGqlRequest.mockResolvedValue({ me: null });
    const { container } = render(<StorageCard />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('DocumentUploadPanel storage line', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderPanel = () => {
    const inputRef = createRef<HTMLInputElement>();
    render(<DocumentUploadPanel applicationId="app-1" category="other" inputRef={inputRef} />, {
      wrapper: Wrapper,
    });
    return inputRef;
  };

  it('shows the space left under the picker', async () => {
    withUsage(30);
    renderPanel();

    expect(await screen.findByText('70 MB left')).toBeInTheDocument();
  });

  it('shows the full state instead of the space left at 100%', async () => {
    withUsage(100);
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/i);
    expect(screen.queryByText(/left/)).not.toBeInTheDocument();
  });

  it('reports the file size with the upload request and shows a storage-full refusal', async () => {
    withUsage(99);
    const inputRef = renderPanel();
    await screen.findByText('1 MB left');

    const file = new File(['x'.repeat(2048)], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(inputRef.current as HTMLInputElement, { target: { files: [file] } });

    expect(await screen.findByText(/Document storage is full/)).toBeInTheDocument();
    expect(mockGqlRequest).toHaveBeenCalledWith(
      expect.stringContaining('requestUploadUrl'),
      expect.objectContaining({
        input: expect.objectContaining({ applicationId: 'app-1', sizeBytes: 2048 }),
      }),
    );
  });
});
