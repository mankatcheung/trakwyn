import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@trakwyn/ui';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { AiGeneratedBadge } from './AiGeneratedBadge';
import { MockBackgroundPicker, type MockBackground } from './MockBackgroundPicker';
import { readRememberedUseProfile } from './mockBackgroundChoice';
import {
  GENERATE_MOCK_TALKING_POINTS,
  type GeneratedTalkingPoints,
  type MockQuestion,
} from './mockQuestionApi';

/**
 * Talking points for one practice question (JEF-394): short bullets the user
 * can say, each citing the entry of their own experience it comes from. They
 * are saved on the question, so they are still there on the next visit.
 */
export function MockTalkingPoints({
  applicationId,
  question,
  onSaved,
}: {
  applicationId: string;
  question: MockQuestion;
  onSaved: () => void;
}) {
  const { t, formatDate } = useLocale();
  const [open, setOpen] = useState(false);
  // Talking points are meaningless without a source, so the profile starts on.
  const [background, setBackground] = useState<MockBackground>(() => ({
    useProfile: readRememberedUseProfile(true),
    documentId: null,
  }));
  const [nothingRelevant, setNothingRelevant] = useState(false);

  const generate = useMutation({
    mutationFn: () =>
      gqlClient.request<{ generateMockTalkingPoints: GeneratedTalkingPoints }>(
        GENERATE_MOCK_TALKING_POINTS,
        {
          mockInterviewQuestionId: question.id,
          useProfile: background.useProfile,
          documentId: background.documentId,
        },
      ),
    onSuccess: (data) => {
      const result = data.generateMockTalkingPoints;
      setNothingRelevant(result.nothingRelevant);
      if (!result.nothingRelevant) {
        setOpen(false);
        onSaved();
      }
    },
  });

  const bullets = (question.talkingPoints ?? '')
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
  const hasSource = background.useProfile || background.documentId !== null;

  return (
    <div className="space-y-2">
      {bullets.length > 0 && (
        <div className="space-y-1 rounded-lg bg-violet-50/60 p-2 dark:bg-violet-900/10">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {t('interviews.talkingPoints')}
            </h4>
            <AiGeneratedBadge />
            {question.talkingPointsGeneratedAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('interviews.talkingPointsGeneratedOn', {
                  date: formatDate(question.talkingPointsGeneratedAt),
                })}
              </span>
            )}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800 dark:text-gray-200">
            {bullets.map((bullet) => (
              <li key={bullet} className="wrap-break-word">
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {open ? (
        <div className="space-y-2">
          <MockBackgroundPicker
            applicationId={applicationId}
            value={background}
            onChange={setBackground}
          />
          {nothingRelevant && (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
              {t('interviews.talkingPointsNothingRelevant')}
            </p>
          )}
          {generate.isError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {getErrorMessage(generate.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={generate.isPending || !hasSource}
              onClick={() => generate.mutate()}
            >
              {generate.isPending
                ? t('interviews.generating')
                : t('interviews.generateTalkingPoints')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setNothingRelevant(false);
            generate.reset();
            setOpen(true);
          }}
        >
          <span className="flex items-center gap-1.5">
            <SparklesIcon size={13} aria-hidden="true" />
            {bullets.length > 0
              ? t('interviews.regenerateTalkingPoints')
              : t('interviews.talkingPoints')}
          </span>
        </Button>
      )}
    </div>
  );
}
