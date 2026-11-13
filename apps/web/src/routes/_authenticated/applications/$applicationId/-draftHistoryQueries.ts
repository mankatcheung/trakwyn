/**
 * Draft history (JEF-584). Inline query strings, like the rest of the draft page,
 * so there is no `.graphql` file or codegen step.
 */

export const DRAFT_VERSIONS_QUERY = `
  query DocumentDraftVersions($draftId: ID!) {
    documentDraftVersions(draftId: $draftId) {
      id
      source
      characterCount
      createdAt
    }
  }
`;

export const DRAFT_VERSION_QUERY = `
  query DocumentDraftVersion($id: ID!) {
    documentDraftVersion(id: $id) {
      id
      source
      plainText
      createdAt
    }
  }
`;

export const CREATE_DRAFT_VERSION_MUTATION = `
  mutation CreateDocumentDraftVersion($draftId: ID!) {
    createDocumentDraftVersion(draftId: $draftId) {
      id
      source
    }
  }
`;

export const RESTORE_DRAFT_VERSION_MUTATION = `
  mutation RestoreDocumentDraftVersion($versionId: ID!) {
    restoreDocumentDraftVersion(versionId: $versionId) {
      id
      contentJson
      plainText
    }
  }
`;

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
