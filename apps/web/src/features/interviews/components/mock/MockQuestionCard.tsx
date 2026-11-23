import { ArrowDownIcon, ArrowUpIcon, EditIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { Button, IconButton } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { AiGeneratedBadge } from '../../../ai/components/AiGeneratedBadge';
import type { MockQuestion } from '../../graphql/mockQuestionApi';
import { MockAnswerDraft } from './MockAnswerDraft';
import { MockTalkingPoints } from './MockTalkingPoints';

/** 44px square on a phone; the icon button's own compact size from `sm` up. */
const ENTRY_ACTION_CLASS = 'h-11 w-11 sm:h-auto sm:w-auto';

export interface MockQuestionCardProps {
  applicationId: string;
  question: MockQuestion;
  index: number;
  total: number;
  /** A reorder is in flight, or a delete is still waiting out its undo window. */
  reorderDisabled: boolean;
  /** The AI answer waiting for the user's decision on this question, if any. */
  draft: { text: string; usedProfile: boolean } | null;
  /** An answer is being generated, for this question or another one. */
  generatingAnswer: boolean;
  /** The answer being generated is this question's. */
  generatingForThis: boolean;
  savingDraft: boolean;
  saveDraftError: string | null;
  onEdit: () => void;
  onGenerateAnswer: () => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
  onSaveDraft: (answer: string) => void;
  onDiscardDraft: () => void;
  onTalkingPointsSaved: () => void;
}

/**
 * One practice question: the question and its answer (or the choice to write
 * or generate one), its talking points, the move, edit and delete actions, and
 * the AI answer draft while the user decides what to keep. The panel owns the
 * state; this only draws one entry.
 */
export function MockQuestionCard({
  applicationId,
  question: q,
  index,
  total,
  reorderDisabled,
  draft,
  generatingAnswer,
  generatingForThis,
  savingDraft,
  saveDraftError,
  onEdit,
  onGenerateAnswer,
  onMove,
  onDelete,
  onSaveDraft,
  onDiscardDraft,
  onTalkingPointsSaved,
}: MockQuestionCardProps) {
  const { t } = useLocale();

  return (
    <article className="space-y-2 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium wrap-break-word text-stone-900 dark:text-stone-100">
            {q.question}
          </p>
          {q.answer ? (
            <>
              <p className="text-sm wrap-break-word whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                {q.answer}
              </p>
              {q.answerSource === 'ai' && <AiGeneratedBadge />}
            </>
          ) : (
            !draft && (
              <div className="space-y-2">
                <p className="text-sm text-stone-500 italic">{t('interviews.noAnswerYet')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={onEdit}>
                    {t('interviews.writeAnswer')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={generatingAnswer}
                    onClick={onGenerateAnswer}
                  >
                    <span className="flex items-center gap-1.5">
                      <SparklesIcon size={13} aria-hidden="true" />
                      {generatingForThis
                        ? t('interviews.generating')
                        : t('interviews.generateAnswer')}
                    </span>
                  </Button>
                </div>
              </div>
            )
          )}
          <MockTalkingPoints
            key={q.talkingPoints ?? 'none'}
            applicationId={applicationId}
            question={q}
            onSaved={onTalkingPointsSaved}
          />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 border-t border-stone-100 pt-2 sm:items-start sm:gap-0.5 sm:border-t-0 sm:pt-0 dark:border-stone-700">
          <IconButton
            className={ENTRY_ACTION_CLASS}
            label={t('interviews.moveQuestionUp')}
            icon={<ArrowUpIcon size={14} />}
            size="sm"
            disabled={index === 0 || reorderDisabled}
            onClick={() => onMove(-1)}
          />
          <IconButton
            className={ENTRY_ACTION_CLASS}
            label={t('interviews.moveQuestionDown')}
            icon={<ArrowDownIcon size={14} />}
            size="sm"
            disabled={index === total - 1 || reorderDisabled}
            onClick={() => onMove(1)}
          />
          <IconButton
            className={ENTRY_ACTION_CLASS}
            label={t('interviews.editQuestion')}
            icon={<EditIcon size={14} />}
            size="sm"
            variant="subtle"
            onClick={onEdit}
          />
          <IconButton
            className={ENTRY_ACTION_CLASS}
            label={t('interviews.deleteQuestion')}
            icon={<Trash2Icon size={14} />}
            size="sm"
            variant="danger"
            onClick={onDelete}
          />
        </div>
      </div>
      {draft && (
        <MockAnswerDraft
          key={draft.text}
          questionId={q.id}
          initialDraft={draft.text}
          initialUsedProfile={draft.usedProfile}
          saving={savingDraft}
          saveError={saveDraftError}
          onSave={onSaveDraft}
          onDiscard={onDiscardDraft}
        />
      )}
    </article>
  );
}
