import { describe, it, expect, vi } from 'vitest';
import { CreateDraftVersionUseCase } from '#src/use-cases/documents/CreateDraftVersionUseCase.js';
import { ListDraftVersionsUseCase } from '#src/use-cases/documents/ListDraftVersionsUseCase.js';
import { GetDraftVersionUseCase } from '#src/use-cases/documents/GetDraftVersionUseCase.js';
import { RestoreDraftVersionUseCase } from '#src/use-cases/documents/RestoreDraftVersionUseCase.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import {
  makeDocumentDraftVersion,
  makeDocumentDraftVersionRepository,
} from '#src/__tests__/helpers/mocks/draftHistory.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { DRAFT_HISTORY } from '#src/use-cases/constants.js';

const CURRENT =
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"now"}]}]}';

function setup(
  opts: {
    owner?: string;
    draft?: ReturnType<typeof makeDocumentDraft> | null;
    version?: ReturnType<typeof makeDocumentDraftVersion> | null;
    latest?: ReturnType<typeof makeDocumentDraftVersion> | null;
    list?: ReturnType<typeof makeDocumentDraftVersion>[];
  } = {},
) {
  const calls: string[] = [];
  const draft =
    opts.draft === undefined
      ? makeDocumentDraft({ contentJson: CURRENT, plainText: 'now' })
      : opts.draft;
  const documentDraftRepository = makeDocumentDraftRepository({
    findById: vi.fn().mockResolvedValue(draft),
    updateContent: vi.fn().mockImplementation(async (_id, data) => {
      calls.push('update');
      return { ...draft, ...data };
    }),
  });
  const version = opts.version === undefined ? makeDocumentDraftVersion() : opts.version;
  const documentDraftVersionRepository = makeDocumentDraftVersionRepository({
    findById: vi.fn().mockResolvedValue(version),
    findLatestByDraft: vi.fn().mockResolvedValue(opts.latest ?? null),
    listByDraft: vi.fn().mockResolvedValue(opts.list ?? []),
    create: vi.fn().mockImplementation(async (data) => {
      calls.push('snapshot');
      return { ...data, createdAt: new Date('2024-06-01') };
    }),
  });
  const applicationRepository = makeApplicationRepository({
    findById: vi.fn().mockResolvedValue(makeApplication({ userId: opts.owner ?? 'user-1' })),
  });
  const transactionManager = {
    run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };
  const deps = {
    documentDraftRepository,
    documentDraftVersionRepository,
    applicationRepository,
    transactionManager,
  };
  return {
    deps,
    calls,
    documentDraftRepository,
    documentDraftVersionRepository,
    transactionManager,
  };
}

const code = async (promise: Promise<unknown>) =>
  ((await promise.catch((e) => e)) as { code?: string }).code;

describe('CreateDraftVersionUseCase (Save version)', () => {
  const cmd = { userId: 'user-1', draftId: 'draft-1' };

  it('saves the draft’s current content as a manual version', async () => {
    const { deps, documentDraftVersionRepository } = setup();
    const version = await new CreateDraftVersionUseCase(deps).execute(cmd);
    expect(documentDraftVersionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 'draft-1', contentJson: CURRENT, source: 'manual' }),
    );
    expect(version.source).toBe('manual');
    expect(documentDraftVersionRepository.pruneToLimit).toHaveBeenCalledWith(
      'draft-1',
      DRAFT_HISTORY.MAX_VERSIONS,
    );
  });

  it('returns the existing latest version when nothing changed since it, instead of a duplicate', async () => {
    const latest = makeDocumentDraftVersion({ contentJson: CURRENT });
    const { deps, documentDraftVersionRepository } = setup({ latest });
    expect(await new CreateDraftVersionUseCase(deps).execute(cmd)).toEqual(latest);
    expect(documentDraftVersionRepository.create).not.toHaveBeenCalled();
  });

  it('refuses to save a blank draft', async () => {
    const { deps } = setup({ draft: makeDocumentDraft({ plainText: '  ' }) });
    expect(await code(new CreateDraftVersionUseCase(deps).execute(cmd))).toBe('VALIDATION');
  });

  it('is NOT_FOUND for a missing draft and FORBIDDEN for another user’s', async () => {
    expect(
      await code(new CreateDraftVersionUseCase(setup({ draft: null }).deps).execute(cmd)),
    ).toBe('NOT_FOUND');
    expect(
      await code(new CreateDraftVersionUseCase(setup({ owner: 'someone-else' }).deps).execute(cmd)),
    ).toBe('FORBIDDEN');
  });
});

describe('ListDraftVersionsUseCase', () => {
  it('returns the draft’s versions, newest first as the repository gives them', async () => {
    const list = [makeDocumentDraftVersion({ id: 'b' }), makeDocumentDraftVersion({ id: 'a' })];
    const { deps } = setup({ list });
    const result = await new ListDraftVersionsUseCase(deps).execute({
      userId: 'user-1',
      draftId: 'draft-1',
    });
    expect(result.map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('only lets the owner read the history', async () => {
    const { deps, documentDraftVersionRepository } = setup({ owner: 'someone-else' });
    expect(
      await code(
        new ListDraftVersionsUseCase(deps).execute({ userId: 'user-1', draftId: 'draft-1' }),
      ),
    ).toBe('FORBIDDEN');
    expect(documentDraftVersionRepository.listByDraft).not.toHaveBeenCalled();
  });

  it('is NOT_FOUND for a missing draft', async () => {
    const { deps } = setup({ draft: null });
    expect(
      await code(new ListDraftVersionsUseCase(deps).execute({ userId: 'user-1', draftId: 'x' })),
    ).toBe('NOT_FOUND');
  });
});

describe('GetDraftVersionUseCase (preview)', () => {
  const query = { userId: 'user-1', versionId: 'version-1' };

  it('returns one version with its content', async () => {
    const { deps } = setup();
    expect((await new GetDraftVersionUseCase(deps).execute(query)).plainText).toBe('old');
  });

  it('is NOT_FOUND when the version, or the draft behind it, is gone', async () => {
    expect(
      await code(new GetDraftVersionUseCase(setup({ version: null }).deps).execute(query)),
    ).toBe('NOT_FOUND');
    expect(await code(new GetDraftVersionUseCase(setup({ draft: null }).deps).execute(query))).toBe(
      'NOT_FOUND',
    );
  });

  it('refuses another user’s version without revealing its content', async () => {
    const { deps } = setup({ owner: 'someone-else' });
    expect(await code(new GetDraftVersionUseCase(deps).execute(query))).toBe('FORBIDDEN');
  });
});

describe('RestoreDraftVersionUseCase', () => {
  const cmd = { userId: 'user-1', versionId: 'version-1' };

  it('snapshots the current content first, then writes the old content back', async () => {
    const {
      deps,
      calls,
      documentDraftRepository,
      documentDraftVersionRepository,
      transactionManager,
    } = setup();
    const version = makeDocumentDraftVersion();
    const draft = await new RestoreDraftVersionUseCase(deps).execute(cmd);

    expect(documentDraftVersionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ contentJson: CURRENT, plainText: 'now', source: 'restore' }),
    );
    expect(documentDraftRepository.updateContent).toHaveBeenCalledWith('draft-1', {
      contentJson: version.contentJson,
      plainText: version.plainText,
    });
    expect(calls).toEqual(['snapshot', 'update']);
    expect(transactionManager.run).toHaveBeenCalledTimes(1);
    expect(draft.contentJson).toBe(version.contentJson);
  });

  it('keeps the restore itself undoable even when the history is already at its cap', async () => {
    const { deps, documentDraftVersionRepository } = setup();
    await new RestoreDraftVersionUseCase(deps).execute(cmd);
    expect(documentDraftVersionRepository.pruneToLimit).toHaveBeenCalledWith(
      'draft-1',
      DRAFT_HISTORY.MAX_VERSIONS,
    );
  });

  it('does not leave a duplicate when the draft already equals the latest snapshot', async () => {
    const { deps, documentDraftVersionRepository, documentDraftRepository } = setup({
      latest: makeDocumentDraftVersion({ id: 'v-latest', contentJson: CURRENT }),
    });
    await new RestoreDraftVersionUseCase(deps).execute(cmd);
    expect(documentDraftVersionRepository.create).not.toHaveBeenCalled();
    expect(documentDraftRepository.updateContent).toHaveBeenCalled();
  });

  it('is NOT_FOUND for a missing version or draft, and FORBIDDEN for another user’s', async () => {
    expect(
      await code(new RestoreDraftVersionUseCase(setup({ version: null }).deps).execute(cmd)),
    ).toBe('NOT_FOUND');
    expect(
      await code(new RestoreDraftVersionUseCase(setup({ draft: null }).deps).execute(cmd)),
    ).toBe('NOT_FOUND');
    const { deps, documentDraftRepository } = setup({ owner: 'someone-else' });
    expect(await code(new RestoreDraftVersionUseCase(deps).execute(cmd))).toBe('FORBIDDEN');
    expect(documentDraftRepository.updateContent).not.toHaveBeenCalled();
  });
});
