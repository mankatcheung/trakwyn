import { useState, type RefObject } from 'react';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { AiErrorMessage } from '#/components/AiErrorMessage';
import { AiActionBar } from '#/components/ai/AiActionBar';
import { AiPromptInput } from '#/components/ai/AiPromptInput';
import { useAiCredits } from '#/components/ai/hooks/useAiCredits';
import { getErrorMessage } from '#/lib/errors';
import { getGqlErrorCode } from '#/lib/graphqlError';
import { useLocale } from '#/lib/i18n';
import { markdownToTiptapNodes, type TiptapNode } from '#/lib/markdownToTiptapDoc';
import type { AiFeature } from '#/lib/billingStatus';
import type { DocumentEditorHandle } from './DocumentDraftEditor';
import { EmptyProfilePrompt, useIsProfileEmpty } from './EmptyProfilePrompt';
import { PolishPreview } from './PolishPreview';
import { ResumeSourcePicker, useResumeSourceChoice } from './ResumeSourcePicker';

const POLISH_MUTATION = `
  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {
    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {
      markdown
    }
  }
`;

const GENERATE_MUTATION = `
  mutation GenerateIntoDocumentDraft(
    $draftId: ID!
    $instructions: String
    $resumeDocumentId: ID
    $resumeDraftId: ID
  ) {
    generateIntoDocumentDraft(
      draftId: $draftId
      instructions: $instructions
      resumeDocumentId: $resumeDocumentId
      resumeDraftId: $resumeDraftId
    ) {
      contentJson
      plainText
    }
  }
`;

export type DraftKind = 'cover_letter' | 'resume';

interface AiHelperPanelProps {
  draftId: string;
  applicationId: string;
  type: DraftKind;
  /** The text on screen right now (not the last save); empty means the helper writes the first version. */
  plainText: string;
  /** The last prompt used on this draft. */
  initialInstructions: string | null;
  editorRef: RefObject<DocumentEditorHandle | null>;
  /** Saves the editor's content and the prompt. Resolves to whether it was saved. */
  onSave: (contentJson: string, plainText: string, aiInstructions: string) => Promise<boolean>;
}

interface Failure {
  code: string | undefined;
  message: string;
}

const PLACEHOLDERS = {
  resume: ['aiHelper.resumeExample1', 'aiHelper.resumeExample2', 'aiHelper.resumeExample3'],
  cover_letter: ['aiHelper.letterExample1', 'aiHelper.letterExample2', 'aiHelper.letterExample3'],
} as const;

function parseDocContent(contentJson: string): TiptapNode[] | null {
  try {
    const doc = JSON.parse(contentJson) as { content?: TiptapNode[] };
    return Array.isArray(doc.content) && doc.content.length > 0 ? doc.content : null;
  } catch {
    return null;
  }
}

/**
 * The resume and cover letter AI helper beside the editor (JEF-506). An empty
 * draft is written from the profile; a draft with text is polished. Polish
 * only shows a preview: the editor changes when Replace or Insert below is
 * chosen, never before.
 */
export function AiHelperPanel({
  draftId,
  applicationId,
  type,
  plainText,
  initialInstructions,
  editorRef,
  onSave,
}: AiHelperPanelProps) {
  const { t } = useLocale();
  const { refresh } = useAiCredits();
  const profileEmpty = useIsProfileEmpty();
  const source = useResumeSourceChoice();
  const [instructions, setInstructions] = useState(initialInstructions ?? '');
  const [preview, setPreview] = useState<{ markdown: string; sourceText: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [askAboutProfile, setAskAboutProfile] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const hasText = plainText.trim().length > 0;
  const generateFeature: AiFeature = type === 'resume' ? 'resume' : 'coverLetter';
  const prompt = instructions.trim();

  const fail = (err: unknown) =>
    setFailure({ code: getGqlErrorCode(err), message: getErrorMessage(err) });

  const saveFromEditor = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const saved = await onSave(editor.getJson(), editor.getText(), instructions);
    if (!saved) setFailure({ code: undefined, message: t('aiHelper.saveFailed') });
  };

  const generate = async () => {
    setFailure(null);
    setPreview(null);
    setAskAboutProfile(false);
    setConfirmRegenerate(false);
    setRunning(true);
    editorRef.current?.setEditable(false);
    try {
      const res = await gqlClient.request<{
        generateIntoDocumentDraft: { contentJson: string; plainText: string };
      }>(GENERATE_MUTATION, {
        draftId,
        instructions: prompt || null,
        resumeDocumentId: type === 'cover_letter' ? source.ids.resumeDocumentId : null,
        resumeDraftId: type === 'cover_letter' ? source.ids.resumeDraftId : null,
      });
      const nodes = parseDocContent(res.generateIntoDocumentDraft.contentJson);
      if (!nodes || !editorRef.current) {
        setFailure({ code: undefined, message: t('aiHelper.unreadable') });
        return;
      }
      editorRef.current.replaceContent(nodes);
      await saveFromEditor();
    } catch (err) {
      fail(err);
    } finally {
      editorRef.current?.setEditable(true);
      setRunning(false);
      void refresh();
    }
  };

  // Generating replaces the whole editor, so anything typed (even a moment ago,
  // before it was saved) is confirmed first. An empty profile writes something
  // generic, so ask about that too (JEF-460).
  const startGenerate = async () => {
    if ((editorRef.current?.getText() ?? plainText).trim().length > 0) {
      setConfirmRegenerate(true);
      return;
    }
    if (profileEmpty) {
      setAskAboutProfile(true);
      return;
    }
    await generate();
  };

  const polish = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setFailure(null);
    setPreview(null);
    setRunning(true);
    editor.setEditable(false);
    const sourceText = editor.getText();
    try {
      const res = await gqlClient.request<{ polishDocumentDraft: { markdown: string } }>(
        POLISH_MUTATION,
        { draftId, plainText: sourceText, instructions: prompt || null },
      );
      setPreview({ markdown: res.polishDocumentDraft.markdown, sourceText });
    } catch (err) {
      fail(err);
    } finally {
      editor.setEditable(true);
      setRunning(false);
    }
  };

  const applyPreview = async (mode: 'replace' | 'insert') => {
    const editor = editorRef.current;
    if (!editor || preview === null) return;
    // The suggestion was made for the text that was sent. If the draft has
    // changed since, replacing would drop those edits: only Insert below is safe.
    if (mode === 'replace' && editor.getText() !== preview.sourceText) return;
    const nodes = markdownToTiptapNodes(preview.markdown);
    if (mode === 'replace') editor.replaceContent(nodes);
    else editor.appendContent(nodes);
    setPreview(null);
    await saveFromEditor();
  };

  return (
    <aside
      aria-label={t('aiHelper.title')}
      className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-900/20"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <SparklesIcon className="size-4 text-blue-600" aria-hidden />
          {t('aiHelper.title')}
        </h2>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
          {t(hasText ? 'aiHelper.polishHelp' : 'aiHelper.generateHelp')}
        </p>
      </div>

      {!hasText && type === 'cover_letter' && (
        <ResumeSourcePicker
          applicationId={applicationId}
          value={source.choice}
          onChange={source.setChoice}
          disabled={running}
        />
      )}

      <AiActionBar
        feature={hasText ? 'polishDraft' : generateFeature}
        label={t(hasText ? 'aiHelper.polish' : 'aiHelper.generate')}
        loadingLabel={t(hasText ? 'aiHelper.polishing' : 'aiHelper.generating')}
        loading={running}
        onRun={hasText ? polish : startGenerate}
      >
        <AiPromptInput
          value={instructions}
          onChange={setInstructions}
          disabled={running}
          placeholderExamples={PLACEHOLDERS[type].map((key) => t(key))}
        />
      </AiActionBar>

      {askAboutProfile && <EmptyProfilePrompt onGenerateAnyway={() => void generate()} />}

      {failure && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          <AiErrorMessage code={failure.code} fallback={failure.message} />
        </p>
      )}

      {preview !== null && (
        <PolishPreview
          markdown={preview.markdown}
          stale={plainText !== preview.sourceText}
          onReplace={() => void applyPreview('replace')}
          onInsert={() => void applyPreview('insert')}
          onDiscard={() => setPreview(null)}
        />
      )}

      {(hasText || confirmRegenerate) && (
        <div className="border-t border-blue-200 pt-3 dark:border-blue-800">
          {confirmRegenerate ? (
            <div role="alertdialog" className="space-y-2">
              <p className="text-xs text-gray-700 dark:text-gray-300">
                {t('aiHelper.regenerateConfirm')}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={running}
                  onClick={() => void generate()}
                >
                  {t('aiHelper.regenerateYes')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmRegenerate(false)}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={running}
              onClick={() => setConfirmRegenerate(true)}
            >
              {t('aiHelper.regenerate')}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
