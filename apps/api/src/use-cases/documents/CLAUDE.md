# Document drafts: history (JEF-584)

Loaded when you work in `use-cases/documents/`. Paths are under `apps/api/src/`.

A draft keeps copies of its earlier content (`DocumentDraftVersion`), so the AI helper or an edit cannot lose text for good. The UI calls it "Draft history", not "versions", to keep it apart from the exported-document versions on an application (`document-version-outcomes`).

- **Whole-content copies, no diffs.** Drafts are small. A version holds `contentJson` and `plainText`; the list never needs the content, so the GraphQL list query asks for `characterCount` only.
- **Snapshots capture the content being replaced,** not the new content. `snapshotDraft` (`draftSnapshot.ts`) is the one place that decides, and all four paths use it:
  - **autosave:** `UpdateDocumentDraftContentUseCase`, only when the newest snapshot is older than `DRAFT_HISTORY.AUTOSAVE_INTERVAL_MS`;
  - **ai:** the same use case with `replacedByAi`, always. The web sends it on a save that carries an AI result (`handleAiSave`), not on an import into a blank draft;
  - **manual:** "Save version", which returns the newest version instead of a duplicate when nothing changed;
  - **restore:** `RestoreDraftVersionUseCase`, so a restore can itself be undone.
- **Nothing worth keeping is skipped:** a blank draft, and content the newest snapshot already holds. A cap of `DRAFT_HISTORY.MAX_VERSIONS` per draft is enforced after every snapshot (`pruneToLimit`, oldest first). Both numbers are policy, in `use-cases/constants.ts`.
- **The snapshot and the write stand or fall together:** both run in `runInTransaction`, so a failed save leaves no orphan copy.
- **Ownership goes through the application** (`findOwnedDraft`), for the list, a single version, Save version and Restore. A version of another user's draft answers FORBIDDEN and never returns its content.
- **The FK cascades from the draft** (`onDeleteBehaviour.test.ts`), so deleting the draft, the application or the account removes its history.
- **The web settles saves first.** Save version and Restore flush the editor's pending edit and wait for it (`settleSaves` in the draft page) and refuse to run if that save failed; Restore puts the returned content into the editor with `replaceContent`, which does not save again.
