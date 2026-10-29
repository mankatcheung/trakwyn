import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import {
  AccountDeletionScheduledError,
  DomainError,
  EmailNotVerifiedError,
} from '#src/use-cases/errors/DomainError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { CV_IMPORT } from '#src/use-cases/constants.js';
import { CV_TOO_LARGE_MESSAGE } from '#src/use-cases/profile/cvImportValidation.js';
import { CV_IMPORT_UPLOAD, ROUTES } from '#src/http/constants.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { diScopeOf } from '#src/http/adapters/fastify/diScope.js';
import { authenticateRoute } from '#src/http/routes/authenticateRoute.js';

interface Refusal {
  status: number;
  message: string;
}

/** What `@fastify/multipart` throws for a request that is not one file, by error code. */
const MULTIPART_REFUSALS: Readonly<Record<string, Refusal>> = {
  FST_REQ_FILE_TOO_LARGE: { status: 413, message: CV_TOO_LARGE_MESSAGE },
  FST_FILES_LIMIT: { status: 400, message: 'Upload one file at a time' },
  FST_FIELDS_LIMIT: { status: 400, message: 'Send only the file' },
  FST_PARTS_LIMIT: { status: 400, message: 'Send only the file' },
  FST_INVALID_MULTIPART_CONTENT_TYPE: { status: 400, message: 'Send the file as a form upload' },
  // The parser aborts the stream when a limit trips (a field with `fields: 0`)
  // and Node reports that, not a Fastify code. It is about the request body
  // whichever way it happened, so it is the caller's malformed upload, not a fault here.
  ERR_STREAM_PREMATURE_CLOSE: { status: 400, message: 'The upload could not be read' },
};

const NO_FILE_MESSAGE = 'Choose a file to upload';
const ONE_FILE_MESSAGE = 'Upload one file at a time';
const ONLY_FILE_MESSAGE = 'Send only the file';

function refuse(reply: FastifyReply, status: number, message: string, code: string): void {
  reply.code(status).send({ error: message, code });
}

function multipartRefusal(error: unknown): Refusal | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? (MULTIPART_REFUSALS[code] ?? null) : null;
}

interface UploadedFile {
  buffer: Buffer;
  mimeType: string;
}

/**
 * The request's one file, with the whole body read. Every part is consumed
 * before anything is spent on the file, so a second file or a stray field
 * is refused here and never reaches the model; the parser's own limits throw
 * for the cases it counts (`multipartRefusal` maps them).
 */
async function readSingleFile(request: FastifyRequest): Promise<UploadedFile | Refusal> {
  let file: UploadedFile | null = null;
  let refusal: Refusal | null = null;
  // Never return from inside the loop: leaving a multipart iteration early
  // destroys the request stream and surfaces as a 500 (ERR_STREAM_PREMATURE_CLOSE).
  // Note the first refusal, drain the rest, and answer once the body is read.
  for await (const part of request.parts()) {
    if (part.type !== 'file') {
      refusal ??= { status: 400, message: ONLY_FILE_MESSAGE };
    } else if (file || refusal) {
      part.file.resume();
      refusal ??= { status: 400, message: ONE_FILE_MESSAGE };
    } else {
      file = { mimeType: declaredMimeType(part.mimetype), buffer: await part.toBuffer() };
    }
  }
  return refusal ?? file ?? { status: 400, message: NO_FILE_MESSAGE };
}

/** The part's declared type without parameters (`text/plain; charset=utf-8`), lower-cased. */
function declaredMimeType(mimetype: string): string {
  return (mimetype.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Reads an uploaded CV into profile entries for the user to review (JEF-461).
 * See `ROUTES.CV_IMPORT` for why this is not a GraphQL mutation.
 *
 * The file is buffered in memory and handed to `ParseCvUseCase`; it is never
 * written anywhere, and neither its name nor its contents are logged. Auth and
 * the email-verification wall match `/chat/stream`, and the request must carry
 * `CV_IMPORT_UPLOAD.REQUIRED_HEADER` (see its doc comment for the CSRF reason).
 * Registered in `buildApp.ts` inside a scope that also holds the multipart
 * parser, so no other route accepts multipart bodies.
 */
export async function handleCvImport(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await authenticateRoute(request);
  if (!user) {
    refuse(reply, 401, 'Unauthorized', ERROR_CODES.UNAUTHORIZED);
    return;
  }
  if (
    request.headers[CV_IMPORT_UPLOAD.REQUIRED_HEADER] !== CV_IMPORT_UPLOAD.REQUIRED_HEADER_VALUE
  ) {
    refuse(reply, 403, 'Forbidden', ERROR_CODES.FORBIDDEN);
    return;
  }

  const { assertEmailVerifiedUseCase, assertAccountActiveUseCase, parseCvUseCase } =
    diScopeOf(request).cradle;
  try {
    await assertEmailVerifiedUseCase.execute(user.sub);
    await assertAccountActiveUseCase.execute(user.sub);
  } catch (err) {
    if (err instanceof EmailNotVerifiedError || err instanceof AccountDeletionScheduledError) {
      refuse(reply, 403, err.message, err.code);
      return;
    }
    throw err;
  }

  let upload: UploadedFile | Refusal;
  try {
    upload = await readSingleFile(request);
  } catch (err) {
    const refusal = multipartRefusal(err);
    if (!refusal) throw err;
    upload = refusal;
  }
  if ('status' in upload) {
    refuse(reply, upload.status, upload.message, ERROR_CODES.VALIDATION);
    return;
  }

  try {
    const parsed = await parseCvUseCase.execute({
      userId: user.sub,
      buffer: upload.buffer,
      mimeType: upload.mimeType,
    });
    // The reply is the CV's contents, so nothing between here and the browser may keep it.
    reply.header('Cache-Control', 'no-store').send(parsed);
  } catch (err) {
    if (!(err instanceof DomainError)) throw err;
    const appError = fromCodedError(err);
    refuse(reply, appError.statusCode, appError.message, appError.code);
  }
}

/**
 * Registers `POST /profile/cv-import` in a plugin scope of its own, so the
 * multipart parser (one file, no other fields, at most `CV_IMPORT.MAX_BYTES`)
 * is available to this route and no other.
 */
export function registerCvImportRoute(fastify: FastifyInstance): void {
  void fastify.register(async (scope) => {
    await scope.register(fastifyMultipart, {
      limits: { fileSize: CV_IMPORT.MAX_BYTES, files: 1, fields: 0 },
    });
    scope.route({
      method: 'POST',
      url: ROUTES.CV_IMPORT,
      handler: handleCvImport,
    });
  });
}
