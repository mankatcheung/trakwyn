import { File, UploadTask, UploadType } from 'expo-file-system';
import i18n from '../../../i18n';

/**
 * Mirrors apps/web's DocumentsTab upload branch, adapted to RN upload
 * primitives: local dev's `/_upload/*` route accepts a raw PUT (unauthenticated
 * — see apps/api/src/http/buildApp.ts, guarded only by the storage-key
 * regex), which expo-file-system's UploadTask handles directly from a file
 * URI without loading the whole file into JS memory.
 */
export async function uploadFileToStorage(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<void> {
  if (uploadUrl.includes('/_upload/')) {
    const file = new File(fileUri);
    const task = new UploadTask(file, uploadUrl, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { 'Content-Type': mimeType },
    });
    const result = await task.uploadAsync();
    if (result.status >= 400) {
      throw new Error(i18n.t('documents:uploadFailedStatus', { status: result.status }));
    }
    return;
  }

  // Production (STORAGE_PROVIDER=vercel-blob) hands back a Blob client
  // token meant for @vercel/blob/client's browser-only put() — not yet
  // wired up for React Native. Local dev is the primary target for the
  // mobile app right now, same as the rest of this phase.
  throw new Error(i18n.t('documents:uploadNotSupported'));
}
