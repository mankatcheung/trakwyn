import { describe, it, expect } from 'vitest';
import {
  assertCvFile,
  assertCvMagicBytes,
  assertCvMimeType,
  assertCvSize,
} from '#src/use-cases/profile/cvImportValidation.js';
import { CV_IMPORT, MIME_TYPE } from '#src/use-cases/constants.js';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';

const pdf = (extra = '') => Buffer.from(`%PDF-1.7\n${extra}`);
const docx = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('rest')]);

describe('assertCvMimeType', () => {
  it.each([MIME_TYPE.PDF, MIME_TYPE.DOCX, MIME_TYPE.TEXT_PLAIN])('accepts %s', (mimeType) => {
    expect(() => assertCvMimeType(mimeType)).not.toThrow();
  });

  it('refuses legacy .doc with a message that says what to do', () => {
    expect(() => assertCvMimeType(MIME_TYPE.DOC)).toThrow(/\.doc files aren't supported/);
    expect(() => assertCvMimeType(MIME_TYPE.DOC)).toThrow(/\.docx or PDF/);
  });

  it.each([MIME_TYPE.PNG, MIME_TYPE.JPEG, 'application/zip', 'text/html', ''])(
    'refuses %s',
    (mimeType) => {
      expect(() => assertCvMimeType(mimeType)).toThrow(ValidationError);
    },
  );
});

describe('assertCvSize', () => {
  it('refuses an empty file', () => {
    expect(() => assertCvSize(0)).toThrow(ValidationError);
  });

  it('accepts a single byte', () => {
    expect(() => assertCvSize(1)).not.toThrow();
  });

  it('accepts a file of exactly the limit', () => {
    expect(() => assertCvSize(CV_IMPORT.MAX_BYTES)).not.toThrow();
  });

  it('refuses a file one byte over the limit', () => {
    expect(() => assertCvSize(CV_IMPORT.MAX_BYTES + 1)).toThrow(/10 MB/);
  });

  it('refuses a size that is not a finite number', () => {
    expect(() => assertCvSize(Number.NaN)).toThrow(ValidationError);
    expect(() => assertCvSize(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });
});

describe('assertCvMagicBytes', () => {
  it('accepts a PDF that starts with its header', () => {
    expect(() => assertCvMagicBytes(pdf(), MIME_TYPE.PDF)).not.toThrow();
  });

  it('accepts a DOCX that starts with the ZIP header', () => {
    expect(() => assertCvMagicBytes(docx(), MIME_TYPE.DOCX)).not.toThrow();
  });

  it('accepts plain UTF-8 text, accents included', () => {
    expect(() =>
      assertCvMagicBytes(Buffer.from('Zoë Müller — Engineer'), MIME_TYPE.TEXT_PLAIN),
    ).not.toThrow();
  });

  it('refuses a PDF declaration over a DOCX body and the reverse', () => {
    expect(() => assertCvMagicBytes(docx(), MIME_TYPE.PDF)).toThrow(ValidationError);
    expect(() => assertCvMagicBytes(pdf(), MIME_TYPE.DOCX)).toThrow(ValidationError);
  });

  it('refuses an executable declared as a PDF', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(32)]);
    expect(() => assertCvMagicBytes(exe, MIME_TYPE.PDF)).toThrow(/doesn't match/);
  });

  it('refuses a file shorter than its header', () => {
    expect(() => assertCvMagicBytes(Buffer.from('%PD'), MIME_TYPE.PDF)).toThrow(ValidationError);
  });

  it('refuses text containing a NUL byte', () => {
    expect(() => assertCvMagicBytes(Buffer.from('abc\0def'), MIME_TYPE.TEXT_PLAIN)).toThrow(
      ValidationError,
    );
  });

  it('refuses text that is not valid UTF-8', () => {
    expect(() =>
      assertCvMagicBytes(Buffer.from([0xff, 0xfe, 0x41, 0x80]), MIME_TYPE.TEXT_PLAIN),
    ).toThrow(ValidationError);
  });

  it('refuses a type it has no signature for', () => {
    expect(() => assertCvMagicBytes(pdf(), MIME_TYPE.PNG)).toThrow(ValidationError);
  });

  it('never echoes the file contents in the message', () => {
    const secret = Buffer.from('my-secret-phone-number\0');
    let message = '';
    try {
      assertCvMagicBytes(secret, MIME_TYPE.TEXT_PLAIN);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('secret');
  });
});

describe('assertCvFile', () => {
  it('passes a well-formed PDF', () => {
    expect(() => assertCvFile(pdf(), MIME_TYPE.PDF)).not.toThrow();
  });

  it('checks the type before the size, so a .doc gets the .doc message', () => {
    expect(() => assertCvFile(Buffer.alloc(0), MIME_TYPE.DOC)).toThrow(/\.doc/);
  });

  it('checks the bytes actually received, not a declared size', () => {
    expect(() => assertCvFile(Buffer.alloc(0), MIME_TYPE.PDF)).toThrow(/empty/i);
  });
});
