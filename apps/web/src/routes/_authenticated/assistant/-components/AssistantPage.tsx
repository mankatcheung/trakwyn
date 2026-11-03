import { useHostedAiAvailable } from '#/lib/aiCredits';
import { AiCreditsMeter } from '#/components/AiCreditsMeter';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import {
  LLM_API_KEYS_QUERY,
  LLM_PROVIDER_LABEL,
  type LlmApiKey,
} from '#/routes/_authenticated/settings/-components/shared';
import {
  conversationsQueryOptions,
  deleteConversationWithUndo,
} from '#/routes/_authenticated/assistant/-shared';
import { ChatConversationView } from './ChatConversationView';
import { HistoryIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { IconButton } from '@trakwyn/ui';
import { Route } from '../index';

export function AssistantPage() {
  const { t } = useLocale();
  const SUGGESTED_QUESTIONS = [
    t('assistant.suggestedQuestion1'),
    t('assistant.suggestedQuestion2'),
    t('assistant.suggestedQuestion3'),
  ];
  const { conversation: activeId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const hostedAi = useHostedAiAvailable();

  const { data: conversationsData } = useQuery(conversationsQueryOptions);
  const conversations = conversationsData?.conversations ?? [];
  const activeConversation = conversations.find((c) => c.id === activeId);

  const { data: llmData } = useQuery({
    queryKey: ['llmApiKeys'],
    queryFn: () =>
      gqlClient.request<{ llmApiKeys: LlmApiKey[]; me: { defaultLlmProvider: string | null } }>(
        LLM_API_KEYS_QUERY,
      ),
  });
  const llmApiKeys = llmData?.llmApiKeys ?? [];
  const [pickedProvider, setPickedProvider] = useState<string | null>(null);
  const [pickedModel, setPickedModel] = useState('');
  useEffect(() => {
    if (pickedProvider === null && llmData) {
      setPickedProvider(
        llmData.me?.defaultLlmProvider ?? llmData.llmApiKeys?.[0]?.provider ?? null,
      );
    }
  }, [llmData, pickedProvider]);

  const onNewConversation = () => {
    setPickedProvider(
      llmData?.me?.defaultLlmProvider ?? llmData?.llmApiKeys?.[0]?.provider ?? null,
    );
    setPickedModel('');
    void navigate({ search: {} });
  };

  const onDeleteActiveConversation = () => {
    if (!activeId) return;
    deleteConversationWithUndo(qc, activeId, () => void navigate({ search: {} }));
  };

  return (
    // Fills whatever main leaves after its own chrome-clearing padding (see
    // AuthenticatedLayout) rather than recomputing it from 100dvh here. The
    // header and composer below are shrink-0 siblings of the one scrollable
    // region, so both stay put while only the messages scroll.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl min-w-0 flex-1 flex-col px-4 pt-4 sm:px-8 sm:pt-8">
        <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {t('assistant.title')}
            </h1>
            {/* Which conversation is open. Pinned with the header so it stays
                readable after scrolling up through a long thread. */}
            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
              {activeId
                ? (activeConversation?.title ?? t('assistant.newConversation'))
                : t('assistant.newConversation')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {activeId && (
              <IconButton
                label={t('assistant.deleteConversation')}
                icon={<Trash2Icon size={16} />}
                variant="danger"
                onClick={onDeleteActiveConversation}
              />
            )}
            <IconButton
              label={t('assistant.newConversation')}
              icon={<PlusIcon size={16} />}
              onClick={onNewConversation}
            />
            <Link
              to="/assistant/history"
              aria-label={t('assistant.conversationHistory')}
              title={t('assistant.conversationHistory')}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
            >
              <HistoryIcon size={16} />
            </Link>
          </div>
        </div>

        <div className="mb-4 shrink-0">
          {activeId && activeConversation?.llmProvider ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('assistant.using')}{' '}
              {LLM_PROVIDER_LABEL[activeConversation.llmProvider] ?? activeConversation.llmProvider}
              {activeConversation.llmModel ? ` (${activeConversation.llmModel})` : ''}
            </p>
          ) : !activeId && llmApiKeys.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                {t('integrations.providerLabel')}
              </label>
              <select
                value={pickedProvider ?? ''}
                onChange={(e) => setPickedProvider(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {llmApiKeys.map((k) => (
                  <option key={k.provider} value={k.provider}>
                    {LLM_PROVIDER_LABEL[k.provider] ?? k.provider}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={pickedModel}
                onChange={(e) => setPickedModel(e.target.value)}
                placeholder={t('assistant.modelOptionalPlaceholder')}
                className="w-40 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          ) : !activeId ? (
            hostedAi === false ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('assistant.addApiKeyPrefix')}{' '}
                <Link to="/settings/ai" className="underline">
                  {t('assistant.settingsLinkText')}
                </Link>{' '}
                {t('assistant.addApiKeySuffix')}
              </p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('assistant.usingTrakwynAi')}{' '}
                <Link to="/settings/ai" className="underline">
                  {t('assistant.useOwnKey')}
                </Link>
              </p>
            )
          ) : null}
          <AiCreditsMeter
            variant="hint"
            className="mt-1 text-xs text-amber-700 dark:text-amber-400"
          />
        </div>

        <ChatConversationView
          conversationId={activeId ?? null}
          provider={pickedProvider}
          model={pickedModel}
          suggestedQuestions={SUGGESTED_QUESTIONS}
          onConversationCreated={(id) => void navigate({ search: { conversation: id } })}
        />
      </div>
    </div>
  );
}
