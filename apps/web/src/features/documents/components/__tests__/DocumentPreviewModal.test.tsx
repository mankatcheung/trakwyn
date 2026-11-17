import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DocumentPreviewModal,
  isPreviewableMimeType,
} from '#/features/documents/components/DocumentPreviewModal';

describe('isPreviewableMimeType', () => {
  it('returns true for PDF', () => {
    expect(isPreviewableMimeType('application/pdf')).toBe(true);
  });

  it('returns true for PNG', () => {
    expect(isPreviewableMimeType('image/png')).toBe(true);
  });

  it('returns true for JPEG', () => {
    expect(isPreviewableMimeType('image/jpeg')).toBe(true);
  });

  it('returns false for DOCX', () => {
    expect(
      isPreviewableMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(isPreviewableMimeType('text/plain')).toBe(false);
  });
});

describe('DocumentPreviewModal', () => {
  const pdfDoc = {
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    url: 'https://example.com/resume.pdf',
  };
  const imageDoc = {
    name: 'photo.png',
    mimeType: 'image/png',
    url: 'https://example.com/photo.png',
  };
  const unsupportedDoc = {
    name: 'report.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    url: 'https://example.com/report.docx',
  };

  it('renders nothing when document is null', () => {
    const { container } = render(<DocumentPreviewModal document={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the document name in the header', () => {
    render(<DocumentPreviewModal document={pdfDoc} onClose={vi.fn()} />);
    expect(screen.getByText('resume.pdf')).toBeInTheDocument();
  });

  it('renders an iframe for PDF documents', () => {
    render(<DocumentPreviewModal document={pdfDoc} onClose={vi.fn()} />);
    const iframe = screen.getByTitle('resume.pdf');
    expect(iframe).toHaveAttribute('src', 'https://example.com/resume.pdf');
  });

  it('renders an img for PNG documents', () => {
    render(<DocumentPreviewModal document={imageDoc} onClose={vi.fn()} />);
    const img = screen.getByAltText('photo.png');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.png');
  });

  it('renders an img for JPEG documents', () => {
    const jpegDoc = { ...imageDoc, name: 'photo.jpg', mimeType: 'image/jpeg' };
    render(<DocumentPreviewModal document={jpegDoc} onClose={vi.fn()} />);
    const img = screen.getByAltText('photo.jpg');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.png');
  });

  it('renders fallback message for unsupported file types', () => {
    render(<DocumentPreviewModal document={unsupportedDoc} onClose={vi.fn()} />);
    expect(screen.getByText(/preview isn't available/i)).toBeInTheDocument();
  });

  it('renders a download link for unsupported file types', () => {
    render(<DocumentPreviewModal document={unsupportedDoc} onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /open report\.docx/i });
    expect(link).toHaveAttribute('href', 'https://example.com/report.docx');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<DocumentPreviewModal document={pdfDoc} onClose={onClose} />);
    // The X button
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons.find((b) => b.querySelector('svg'));
    expect(closeButton).toBeDefined();
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<DocumentPreviewModal document={pdfDoc} onClose={onClose} />);
    // Modal renders via a portal to document.body, so the backdrop lives
    // outside the RTL container div — query the owner document instead.
    const backdrop = container.ownerDocument.querySelector('.bg-black\\/50');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the "Open in new tab" link', () => {
    render(<DocumentPreviewModal document={pdfDoc} onClose={vi.fn()} />);
    const link = screen.getByTitle('Open in new tab');
    expect(link).toHaveAttribute('href', 'https://example.com/resume.pdf');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
