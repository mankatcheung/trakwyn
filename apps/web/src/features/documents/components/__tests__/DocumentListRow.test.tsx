import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DraftRow, FileRow } from '#/features/documents/components/DocumentListRow';
import type { Document, DocumentDraft } from '#/features/documents/graphql/documentQueries';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, title }: { children: ReactNode; to: string; title?: string }) => (
    <a href={to} title={title}>
      {children}
    </a>
  ),
}));

vi.mock('#/features/documents/components/review/ResumeAtsPanel', () => ({
  ResumeAts: ({
    children,
  }: {
    children: (r: { chip: ReactNode; details: ReactNode }) => ReactNode;
  }) => children({ chip: <span>ats-chip</span>, details: <div>ats-details</div> }),
}));
vi.mock('#/features/documents/components/review/ResumeMatchPanel', () => ({
  ResumeMatch: ({
    children,
  }: {
    children: (r: { chip: ReactNode; details: ReactNode }) => ReactNode;
  }) => children({ chip: <span>match-chip</span>, details: <div>match-details</div> }),
}));

const stamp = '2026-03-04T12:00:00.000Z';

const draft: DocumentDraft = {
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'resume',
  title: 'Backend resume',
  createdAt: stamp,
  updatedAt: stamp,
};

const file: Document = {
  id: 'file-1',
  applicationId: 'app-1',
  name: 'cv.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  url: 'https://files.test/cv.pdf',
  documentType: 'resume',
  createdAt: stamp,
};

const inList = (node: ReactNode) => render(<ul>{node}</ul>);
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DraftRow', () => {
  it('links the title to the editor and badges the row as a draft', () => {
    inList(<DraftRow applicationId="app-1" draft={draft} withMatch={false} onDelete={() => {}} />);

    expect(screen.getByRole('link', { name: 'Backend resume' })).toHaveAttribute(
      'href',
      '/applications/$applicationId/documents/$draftId',
    );
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/Edited/)).toBeInTheDocument();
  });

  it('shows no ATS or match chips on a cover letter', () => {
    inList(<DraftRow applicationId="app-1" draft={draft} withMatch={false} onDelete={() => {}} />);

    expect(screen.queryByText('ats-chip')).not.toBeInTheDocument();
  });

  it('shows the ATS and match chips and their details on a resume', () => {
    inList(<DraftRow applicationId="app-1" draft={draft} withMatch onDelete={() => {}} />);

    expect(screen.getByText('ats-chip')).toBeInTheDocument();
    expect(screen.getByText('match-chip')).toBeInTheDocument();
    expect(screen.getByText('ats-details')).toBeInTheDocument();
    expect(screen.getByText('match-details')).toBeInTheDocument();
  });

  it('opens the editor from the menu', () => {
    inList(<DraftRow applicationId="app-1" draft={draft} withMatch={false} onDelete={() => {}} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(mockNavigate).toHaveBeenCalledExactlyOnceWith({
      to: '/applications/$applicationId/documents/$draftId',
      params: { applicationId: 'app-1', draftId: 'draft-1' },
    });
  });

  it('hands the draft to delete from the menu', () => {
    const onDelete = vi.fn();
    inList(<DraftRow applicationId="app-1" draft={draft} withMatch={false} onDelete={onDelete} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(draft);
  });
});

describe('FileRow', () => {
  const renderFile = (props: Partial<Parameters<typeof FileRow>[0]> = {}) => {
    const onPreview = vi.fn();
    const onDelete = vi.fn();
    inList(
      <FileRow
        applicationId="app-1"
        document={file}
        withMatch={false}
        showPortfolioBadge={false}
        onPreview={onPreview}
        onDelete={onDelete}
        {...props}
      />,
    );
    return { onPreview, onDelete };
  };

  it('shows the size, the upload date and the extension', () => {
    renderFile({ document: { ...file, version: 'v2' } });

    expect(screen.getByRole('button', { name: 'cv.pdf' })).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB · v2/)).toBeInTheDocument();
    expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
  });

  it('previews a previewable file when its name is pressed', () => {
    const { onPreview } = renderFile();

    fireEvent.click(screen.getByRole('button', { name: 'cv.pdf' }));

    expect(onPreview).toHaveBeenCalledExactlyOnceWith(file);
  });

  it('opens a file that cannot be previewed in a new tab instead', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const doc = { ...file, name: 'notes.bin', mimeType: 'application/octet-stream' };
    const { onPreview } = renderFile({ document: doc });

    fireEvent.click(screen.getByRole('button', { name: 'notes.bin' }));

    expect(onPreview).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(file.url, '_blank', 'noopener,noreferrer');
  });

  it('offers Preview and Open in new tab for a previewable file', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { onPreview } = renderFile();

    openMenu();
    const labels = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(labels).toEqual(['Preview', 'Open in new tab', 'Delete']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));
    expect(onPreview).toHaveBeenCalledOnce();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in new tab' }));
    expect(open).toHaveBeenCalledWith(file.url, '_blank', 'noopener,noreferrer');
  });

  it('offers Download instead of Preview for a file that cannot be previewed', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderFile({ document: { ...file, mimeType: 'application/octet-stream' } });

    openMenu();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Download',
      'Delete',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download' }));

    expect(open).toHaveBeenCalledOnce();
  });

  it('hands the file to delete from the menu', () => {
    const { onDelete } = renderFile();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(file);
  });

  it('badges a portfolio file only where asked', () => {
    const portfolio = { ...file, documentType: 'portfolio' };
    const { unmount } = render(
      <ul>
        <FileRow
          applicationId="app-1"
          document={portfolio}
          withMatch={false}
          showPortfolioBadge
          onPreview={() => {}}
          onDelete={() => {}}
        />
      </ul>,
    );
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
    unmount();

    renderFile({ document: portfolio });
    expect(screen.queryByText('Portfolio')).not.toBeInTheDocument();
  });

  it('shows the match chips on a resume file', () => {
    renderFile({ withMatch: true });

    expect(screen.getByText('ats-chip')).toBeInTheDocument();
    expect(screen.getByText('match-details')).toBeInTheDocument();
  });
});
