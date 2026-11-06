import { useCallback, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { proseToTiptapDoc } from '../../../lib/proseToTiptapDoc';
import { useAiCredits } from '../../ai/hooks/useAiCredits';
import type { ResumeChoice } from '../components/ResumeSourcePicker';
import { useGenerateIntoDocumentDraft, usePolishDocumentDraft } from './useDocumentDraftAi';
import type { DraftSaver } from './useDraftSaver';
import type { DocumentDraftType } from '../types';

export const AI_PROMPT_MAX_LENGTH = 500;

export interface PolishSuggestion {
  markdown: string;
  /** The editor text the suggestion was written for. */
  sourceText: string;
}

interface Options {
  draftId: string;
  type: DocumentDraftType;
  /** The text on screen right now, not the last save. */
  getText: () => string;
  /** Puts text in the editor without queuing its own autosave. */
  setText: (text: string) => void;
  saver: DraftSaver;
}

/**
 * The AI helper's logic for the draft editor (JEF-508). Generate writes a first
 * version; Polish only produces a suggestion, and nothing in the editor changes
 * until Replace or Insert below. Replace is refused when the text moved on since
 * the suggestion was made. Every result is saved through the editor's serialised
 * saver, so a failed save can be retried from the editor.
 */
export function useDraftAiHelper({ draftId, type, getText, setText, saver }: Options) {
  const polishMutation = usePolishDocumentDraft();
  const generateMutation = useGenerateIntoDocumentDraft();
  const { refresh } = useAiCredits();
  const [suggestion, setSuggestion] = useState<PolishSuggestion | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const running = polishMutation.isPending || generateMutation.isPending;

  const generate = useCallback(
    async (instructions: string, resume: ResumeChoice | null) => {
      setFailure(null);
      setSuggestion(null);
      try {
        const result = await generateMutation.mutateAsync({
          draftId,
          instructions: instructions.trim() || null,
          resumeDocumentId: type === 'cover_letter' && resume?.kind === 'file' ? resume.id : null,
          resumeDraftId: type === 'cover_letter' && resume?.kind === 'draft' ? resume.id : null,
        });
        setText(result.plainText);
        await saver.save({
          contentJson: result.contentJson,
          plainText: result.plainText,
          aiInstructions: instructions.trim(),
        });
        return true;
      } catch (err) {
        setFailure(getErrorMessage(err));
        return false;
      } finally {
        void refresh();
      }
    },
    [draftId, type, generateMutation, setText, saver, refresh],
  );

  const polish = useCallback(
    async (instructions: string) => {
      setFailure(null);
      setSuggestion(null);
      const sourceText = getText();
      try {
        const markdown = await polishMutation.mutateAsync({
          draftId,
          plainText: sourceText,
          instructions: instructions.trim() || null,
        });
        setSuggestion({ markdown, sourceText });
      } catch (err) {
        setFailure(getErrorMessage(err));
      } finally {
        void refresh();
      }
    },
    [draftId, getText, polishMutation, refresh],
  );

  const apply = useCallback(
    async (mode: 'replace' | 'insert', instructions: string) => {
      if (!suggestion) return;
      const current = getText();
      // The suggestion was made for the text that was sent; replacing would drop later edits.
      if (mode === 'replace' && current !== suggestion.sourceText) return;
      const next =
        mode === 'replace' ? suggestion.markdown : `${current.trimEnd()}\n\n${suggestion.markdown}`;
      setSuggestion(null);
      setText(next);
      const { contentJson, plainText } = proseToTiptapDoc(next);
      await saver.save({ contentJson, plainText, aiInstructions: instructions.trim() });
    },
    [suggestion, getText, setText, saver],
  );

  return {
    running,
    suggestion,
    failure,
    generate,
    polish,
    replace: (instructions: string) => apply('replace', instructions),
    insertBelow: (instructions: string) => apply('insert', instructions),
    discard: () => setSuggestion(null),
  };
}
