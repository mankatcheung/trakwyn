import type { QueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import {
  NOTES_QUERY,
  CREATE_NOTE,
  UPDATE_NOTE,
  DELETE_NOTE,
} from '#/features/notes/graphql/noteQueries';
import {
  CREATE_OFFER_MUTATION,
  DELETE_OFFER_MUTATION,
  UPDATE_OFFER_MUTATION,
  applicationOffersQueryOptions,
  invalidateOffers,
} from '#/features/offers/graphql/applicationOffersQueries';
import {
  CONFIRM_DOCUMENT,
  DELETE_DOCUMENT,
  REQUEST_UPLOAD_URL,
  documentsQueryOptions,
} from '#/features/documents/graphql/documentQueries';
import { sectionCountsQueryKey } from '#/features/application-detail/lib/sectionCounts';
import {
  createApplication,
  isInvalidated,
  newTestQueryClient,
  registerFreshUser,
  sectionCounts,
  field,
} from './support/fixtures';

/**
 * Notes, offers and documents against a real API. Each write is followed by a
 * read of the list and of the parent application's `sectionCounts`, because the
 * detail page's badges are their own query (JEF-208) and a resolver that stopped
 * counting would leave a badge wrong while every list stayed right.
 *
 * Documents are metadata only: the file goes to storage by a signed URL the
 * browser uploads to, which Playwright's `cv-import.spec.ts` covers.
 */

describe('notes, offers and documents against a real API', () => {
  let applicationId: string;
  let client: QueryClient;

  beforeAll(async () => {
    await registerFreshUser('children');
  });

  beforeEach(async () => {
    client = newTestQueryClient();
    applicationId = await createApplication();
  });

  describe('notes', () => {
    const notes = async () => (await gqlClient.request(NOTES_QUERY, { applicationId })).notes ?? [];
    const addNote = async (content: string) =>
      field(await gqlClient.request(CREATE_NOTE, { applicationId, content }), 'createNote');

    it('creates, updates and deletes a note, with the badge following', async () => {
      expect((await sectionCounts(applicationId))?.notes).toBe(0);

      const note = await addNote('First thoughts');
      await addNote('Second thoughts');
      expect((await notes()).map((n) => n.content).sort()).toEqual([
        'First thoughts',
        'Second thoughts',
      ]);
      expect((await sectionCounts(applicationId))?.notes).toBe(2);

      await gqlClient.request(UPDATE_NOTE, { id: note.id, content: 'Revised' });
      expect((await notes()).find((n) => n.id === note.id)?.content).toBe('Revised');
      expect((await sectionCounts(applicationId))?.notes).toBe(2);

      await gqlClient.request(DELETE_NOTE, { id: note.id });
      expect((await notes()).map((n) => n.content)).toEqual(['Second thoughts']);
      expect((await sectionCounts(applicationId))?.notes).toBe(1);
    });
  });

  describe('offers', () => {
    const offers = async () =>
      (await client.query(applicationOffersQueryOptions(applicationId))).offers;

    it('creates, updates and deletes an offer, with the badge following', async () => {
      const createOffer = field(
        await gqlClient.request(CREATE_OFFER_MUTATION, {
          input: { applicationId, baseSalary: 120000, currency: 'USD', period: 'year' },
        }),
        'createOffer',
      );
      expect(await offers()).toEqual([
        expect.objectContaining({ id: createOffer.id, baseSalary: 120000, currency: 'USD' }),
      ]);
      expect((await sectionCounts(applicationId))?.offers).toBe(1);

      await gqlClient.request(UPDATE_OFFER_MUTATION, {
        input: { offerId: createOffer.id, baseSalary: 135000, notes: 'Negotiated' },
      });
      expect((await offers())[0]).toMatchObject({ baseSalary: 135000, notes: 'Negotiated' });
      expect((await sectionCounts(applicationId))?.offers).toBe(1);

      await gqlClient.request(DELETE_OFFER_MUTATION, { id: createOffer.id });
      expect(await offers()).toEqual([]);
      expect((await sectionCounts(applicationId))?.offers).toBe(0);
    });

    it('invalidateOffers marks the offers list and the section badge stale, and a refetch shows the new write', async () => {
      await offers();
      await client.query({
        queryKey: sectionCountsQueryKey(applicationId),
        queryFn: () => sectionCounts(applicationId),
      });
      await gqlClient.request(CREATE_OFFER_MUTATION, {
        input: { applicationId, baseSalary: 90000 },
      });

      await invalidateOffers(client, applicationId);

      expect(isInvalidated(client, applicationOffersQueryOptions(applicationId).queryKey)).toBe(
        true,
      );
      expect(isInvalidated(client, sectionCountsQueryKey(applicationId))).toBe(true);
      expect(await offers()).toHaveLength(1);
      expect(
        (
          await client.query({
            queryKey: sectionCountsQueryKey(applicationId),
            queryFn: () => sectionCounts(applicationId),
          })
        )?.offers,
      ).toBe(1);
    });
  });

  describe('documents (metadata)', () => {
    const documents = async () =>
      (await client.query(documentsQueryOptions(applicationId))).documents;

    /** Puts a few bytes where the API said to, so `confirmDocument` finds the object. */
    async function storeFile(
      name: string,
      body: string,
    ): Promise<{ storageKey: string; size: number }> {
      const bytes = new TextEncoder().encode(body);
      const requestUploadUrl = field(
        await gqlClient.request(REQUEST_UPLOAD_URL, {
          input: {
            applicationId,
            filename: name,
            mimeType: 'text/plain',
            sizeBytes: bytes.byteLength,
          },
        }),
        'requestUploadUrl',
      );
      const { uploadUrl, storageKey } = requestUploadUrl;
      if (!uploadUrl || !storageKey) throw new Error('The API gave no upload URL');
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: bytes,
      });
      expect(response.ok).toBe(true);
      return { storageKey, size: bytes.byteLength };
    }

    it('lists a confirmed document and drops it once deleted', async () => {
      const { storageKey, size } = await storeFile('cover.txt', 'Dear hiring manager');
      const confirmDocument = field(
        await gqlClient.request(CONFIRM_DOCUMENT, {
          input: {
            applicationId,
            storageKey,
            name: 'cover.txt',
            mimeType: 'text/plain',
            sizeBytes: size,
            documentType: 'cover_letter',
          },
        }),
        'confirmDocument',
      );

      expect(await documents()).toEqual([
        expect.objectContaining({
          id: confirmDocument.id,
          name: 'cover.txt',
          mimeType: 'text/plain',
          sizeBytes: size,
          documentType: 'cover_letter',
        }),
      ]);

      await gqlClient.request(DELETE_DOCUMENT, { id: confirmDocument.id });
      expect(await documents()).toEqual([]);
    });
  });
});
