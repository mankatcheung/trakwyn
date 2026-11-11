import { useEffect, useState } from 'react';
import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { IconButton } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import {
  AI_FEEDBACK_REASONS,
  CLEAR_AI_OUTPUT_RATING,
  RATE_AI_OUTPUT,
  type AiFeedbackReason,
  type AiFeedbackTarget,
  type AiRating,
} from '#/lib/aiFeedback';

interface AiFeedbackControlProps {
  targetKind: AiFeedbackTarget;
  targetId: string;
  /** The caller's rating as last loaded; null when there is none. */
  rating: AiRating | null;
  /** Called with the new rating (null once cleared), so a cache that holds it can follow. */
  onChange?: (rating: AiRating | null) => void;
  /** The visible caption beside the thumbs; omit for just the two buttons. */
  caption?: string;
  className?: string;
}

const ACTIVE = 'text-blue-600 dark:text-blue-400';

/**
 * Thumbs up/down on one AI output (JEF-547). A thumbs down saves at once and
 * then offers a reason from a fixed list, which is optional: leaving it, or
 * choosing Skip, keeps the down-vote. Pressing the active thumb again takes the
 * rating back. The change shows straight away and is rolled back if the API
 * refuses it. Nothing the user types is ever sent, only the kind, the id and
 * the choice.
 */
export function AiFeedbackControl({
  targetKind,
  targetId,
  rating: initial,
  onChange,
  caption,
  className,
}: AiFeedbackControlProps) {
  const { t } = useLocale();
  const [rating, setRating] = useState<AiRating | null>(initial);
  const [askReason, setAskReason] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A reload or another tab can change what is stored; follow it.
  useEffect(() => {
    setRating(initial);
  }, [initial]);

  const apply = async (next: AiRating | null) => {
    const before = rating;
    setRating(next);
    setError(null);
    setBusy(true);
    try {
      if (next) {
        await gqlClient.request(RATE_AI_OUTPUT, {
          targetKind,
          targetId,
          rating: next.rating,
          reason: next.reason,
        });
      } else {
        await gqlClient.request(CLEAR_AI_OUTPUT_RATING, { targetKind, targetId });
      }
      onChange?.(next);
    } catch (err) {
      setRating(before);
      setAskReason(false);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const press = (value: 'UP' | 'DOWN') => {
    if (rating?.rating === value) {
      setAskReason(false);
      void apply(null);
      return;
    }
    setAskReason(value === 'DOWN');
    void apply({ rating: value, reason: null });
  };

  const chooseReason = (reason: AiFeedbackReason) => {
    setAskReason(false);
    void apply({ rating: 'DOWN', reason });
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1">
        {caption && <span className="text-xs text-gray-500 dark:text-gray-400">{caption}</span>}
        <IconButton
          size="sm"
          variant="subtle"
          label={t('aiFeedback.up')}
          aria-pressed={rating?.rating === 'UP'}
          disabled={busy}
          className={rating?.rating === 'UP' ? ACTIVE : undefined}
          icon={<ThumbsUpIcon className="size-4" aria-hidden />}
          onClick={() => press('UP')}
        />
        <IconButton
          size="sm"
          variant="subtle"
          label={t('aiFeedback.down')}
          aria-pressed={rating?.rating === 'DOWN'}
          disabled={busy}
          className={rating?.rating === 'DOWN' ? ACTIVE : undefined}
          icon={<ThumbsDownIcon className="size-4" aria-hidden />}
          onClick={() => press('DOWN')}
        />
      </div>

      {askReason && rating?.rating === 'DOWN' && (
        <div
          role="group"
          aria-label={t('aiFeedback.reasonPrompt')}
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
        >
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('aiFeedback.reasonPrompt')}
          </span>
          {AI_FEEDBACK_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => chooseReason(reason)}
              className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {t(`aiFeedback.reason.${reason}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAskReason(false)}
            className="px-1.5 py-1 text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {t('aiFeedback.reasonSkip')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {t('aiFeedback.error')} {error}
        </p>
      )}
    </div>
  );
}
