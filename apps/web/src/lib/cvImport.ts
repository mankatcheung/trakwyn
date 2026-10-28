import { CV_IMPORT_URL, gqlClient, traceHeaders } from '#/graphql/client';
import { ERROR_CODES } from '#/constants';

/**
 * The CV import upload (JEF-461): a multipart POST to `/profile/cv-import`,
 * which reads the file into entries for review. Not GraphQL — see
 * `ROUTES.CV_IMPORT` on the API. The file is read once and never stored.
 */

/** Mirrors `CV_IMPORT.MAX_BYTES` in apps/api (the document upload cap). */
export const CV_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const CV_IMPORT_MAX_MB = CV_IMPORT_MAX_BYTES / (1024 * 1024);

/**
 * Must match `CV_IMPORT_UPLOAD` in apps/api. A custom header makes the browser
 * preflight the request, which is what stops another site posting a file with
 * the visitor's cookie; the API refuses an upload without it.
 */
const UPLOAD_HEADER = 'x-trakwyn-upload';
const UPLOAD_HEADER_VALUE = 'cv-import';

const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};
const ACCEPTED_TYPES = Object.values(TYPE_BY_EXTENSION);
const LEGACY_DOC_TYPE = 'application/msword';

/** For the file input's `accept`: extensions as well as types, since a type can be missing. */
export const CV_IMPORT_ACCEPT = [
  ...Object.keys(TYPE_BY_EXTENSION).map((extension) => `.${extension}`),
  ...ACCEPTED_TYPES,
].join(',');

export type CvFileProblem = 'unsupported' | 'doc' | 'empty' | 'tooLarge';

type FileLike = Pick<File, 'name' | 'size' | 'type'>;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * The type to send for a file: the browser's when it is one the API reads,
 * otherwise the one its extension implies. Some systems report an empty or
 * generic type for `.docx` and `.txt`, and the API refuses a part it cannot
 * recognise. Null for a file that is neither.
 */
export function resolveCvMimeType(file: FileLike): string | null {
  if (ACCEPTED_TYPES.includes(file.type)) return file.type;
  return TYPE_BY_EXTENSION[extensionOf(file.name)] ?? null;
}

/**
 * The same checks the API makes, so a wrong file is turned away at once
 * instead of after an upload. The API's answer is the one that counts.
 */
export function validateCvFile(file: FileLike): CvFileProblem | null {
  if (extensionOf(file.name) === 'doc' || file.type === LEGACY_DOC_TYPE) return 'doc';
  if (!resolveCvMimeType(file)) return 'unsupported';
  if (file.size === 0) return 'empty';
  if (file.size > CV_IMPORT_MAX_BYTES) return 'tooLarge';
  return null;
}

/** Dates are `YYYY-MM`, the value of an `<input type="month">`. */
export interface ParsedCvWorkExperience {
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvEducation {
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvSkill {
  name: string;
  category: string | null;
  proficiency: string | null;
  alreadyInProfile: boolean;
}

export interface ParsedCvProfile {
  workExperiences: ParsedCvWorkExperience[];
  educations: ParsedCvEducation[];
  skills: ParsedCvSkill[];
  /** The CV was longer than the model is given, so later entries may be missing. */
  truncated: boolean;
}

/**
 * An answer from the API. `message` is the API's own wording, safe to show;
 * it is empty when the response had none, and the caller supplies a default.
 */
export class CvImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CvImportError';
  }
}

// Any authenticated GraphQL call will do: its refresh-and-retry is the point.
const SESSION_REFRESH_PROBE = `query CvImportSession { me { id } }`;

function post(file: File, mimeType: string, signal?: AbortSignal): Promise<Response> {
  const body = new FormData();
  // slice() re-types the file without copying it.
  body.append('file', file.slice(0, file.size, mimeType), file.name);
  return fetch(CV_IMPORT_URL, {
    method: 'POST',
    credentials: 'include',
    // No Content-Type: the browser sets it, with the multipart boundary.
    headers: { [UPLOAD_HEADER]: UPLOAD_HEADER_VALUE, ...traceHeaders(CV_IMPORT_URL) },
    body,
    signal,
  });
}

/**
 * Uploads a CV and returns the entries read from it. Throws `CvImportError`
 * for an answer from the API, and lets a network failure through as is.
 *
 * An expired access token is refreshed once and the upload retried: unlike
 * `gqlClient`, a plain `fetch` has no refresh of its own, and the token is
 * short-lived enough that an import after a coffee would otherwise fail.
 */
export async function uploadCv(file: File, signal?: AbortSignal): Promise<ParsedCvProfile> {
  const mimeType = resolveCvMimeType(file);
  if (!mimeType) throw new CvImportError('', ERROR_CODES.VALIDATION);

  let response = await post(file, mimeType, signal);
  if (response.status === 401) {
    await gqlClient.request(SESSION_REFRESH_PROBE);
    response = await post(file, mimeType, signal);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
      code?: unknown;
    } | null;
    throw new CvImportError(
      typeof body?.error === 'string' ? body.error : '',
      typeof body?.code === 'string' ? body.code : ERROR_CODES.INTERNAL_ERROR,
    );
  }
  return (await response.json()) as ParsedCvProfile;
}
