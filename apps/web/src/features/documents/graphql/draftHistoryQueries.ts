import { graphql } from '#/graphql/generated';

/** Draft history (JEF-584). */

export const DRAFT_VERSIONS_QUERY = graphql(`
  query DocumentDraftVersions($draftId: ID!) {
    documentDraftVersions(draftId: $draftId) {
      id
      source
      characterCount
      createdAt
    }
  }
`);

export const DRAFT_VERSION_QUERY = graphql(`
  query DocumentDraftVersion($id: ID!) {
    documentDraftVersion(id: $id) {
      id
      source
      plainText
      createdAt
    }
  }
`);

export const CREATE_DRAFT_VERSION_MUTATION = graphql(`
  mutation CreateDocumentDraftVersion($draftId: ID!) {
    createDocumentDraftVersion(draftId: $draftId) {
      id
      source
    }
  }
`);

export const RESTORE_DRAFT_VERSION_MUTATION = graphql(`
  mutation RestoreDocumentDraftVersion($versionId: ID!) {
    restoreDocumentDraftVersion(versionId: $versionId) {
      id
      contentJson
      plainText
    }
  }
`);

export type DraftVersionSource = 'autosave' | 'ai' | 'manual' | 'restore';

export interface DraftVersionSummary {
  id: string;
  source: DraftVersionSource;
  characterCount: number;
  createdAt: string;
}

export interface DraftVersionPreview {
  id: string;
  source: DraftVersionSource;
  plainText: string;
  createdAt: string;
}

export interface RestoredDraft {
  id: string;
  contentJson: string;
  plainText: string;
}

export const draftVersionsQueryKey = (draftId: string) => ['draftVersions', draftId] as const;
export const draftVersionQueryKey = (versionId: string) => ['draftVersion', versionId] as const;
