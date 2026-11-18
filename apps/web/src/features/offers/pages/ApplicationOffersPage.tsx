import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { getGqlErrorCode, PLAN_REQUIRED_CODE } from '#/lib/graphqlError';
import { ErrorState } from '#/components/ErrorState';
import { QuotaHint } from '#/features/quota/components/QuotaHint';
import { UpgradePrompt } from '#/features/plans/components/UpgradePrompt';
import { useQuotaState } from '#/features/quota/lib/contentQuota';
import { OfferForm } from '../components/OfferForm';
import { PlusIcon, TrashIcon, PencilIcon } from 'lucide-react';
import { Alert, EmptyState } from '@trakwyn/ui';
import {
  CREATE_OFFER_MUTATION,
  DELETE_OFFER_MUTATION,
  UPDATE_OFFER_MUTATION,
  applicationOffersQueryOptions,
  invalidateOffers,
  type ApplicationOffer,
  type OfferInput,
} from '../graphql/applicationOffersQueries';

const route = getRouteApi('/_authenticated/applications/$applicationId/offers/');

/**
 * The API's own message, so a race past the cap names the limit (JEF-494). A
 * plan error is the upgrade prompt rather than an alert (JEF-344).
 */
function WriteError({ error }: { error: unknown }) {
  const message = getErrorMessage(error);
  if (getGqlErrorCode(error) === PLAN_REQUIRED_CODE) {
    return <UpgradePrompt message={message} className="mt-2" />;
  }
  return (
    <Alert className="mt-2" role="alert">
      {message}
    </Alert>
  );
}

export function ApplicationOffersPage() {
  const { t } = useLocale();
  const { applicationId } = route.useParams();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ApplicationOffer | null>(null);

  const {
    data,
    isLoading,
    error: loadError,
    refetch,
  } = useQuery(applicationOffersQueryOptions(applicationId));
  const offers = data?.offers ?? [];
  const offersFull = useQuotaState('offers', offers.length)?.level === 'full';

  const createOffer = useMutation({
    mutationFn: (input: OfferInput) =>
      gqlClient.request(CREATE_OFFER_MUTATION, { input: { applicationId, ...input } }),
    onSuccess: () => invalidateOffers(qc, applicationId),
  });
  const updateOffer = useMutation({
    mutationFn: ({ offerId, input }: { offerId: string; input: OfferInput }) =>
      gqlClient.request(UPDATE_OFFER_MUTATION, { input: { offerId, ...input } }),
    onSuccess: () => invalidateOffers(qc, applicationId),
  });
  const removeOffer = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_OFFER_MUTATION, { id }),
    onSuccess: () => invalidateOffers(qc, applicationId),
  });

  // The error renders from the mutation and the form stays open, so the
  // rejection is caught here instead of being thrown into the form's action.
  const handleCreate = async (input: OfferInput) => {
    try {
      await createOffer.mutateAsync(input);
      setShowForm(false);
    } catch {
      // `createOffer.error` renders under the form.
    }
  };

  const handleUpdate = async (input: OfferInput) => {
    if (!editingOffer) return;
    try {
      await updateOffer.mutateAsync({ offerId: editingOffer.id, input });
      setEditingOffer(null);
    } catch {
      // `updateOffer.error` renders under the form.
    }
  };

  const handleDelete = (offerId: string) => {
    if (!confirm(t('offers.deleteConfirm'))) return;
    removeOffer.mutate(offerId);
  };

  const openCreate = () => {
    createOffer.reset();
    updateOffer.reset();
    setShowForm(true);
    setEditingOffer(null);
  };

  const openEdit = (offer: ApplicationOffer) => {
    createOffer.reset();
    updateOffer.reset();
    setEditingOffer(offer);
    setShowForm(false);
  };

  const formatSalary = (amount: number, currency: string, period: string) => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);

    if (period === 'yearly') return `${formatted}/yr`;
    if (period === 'monthly') return `${formatted}/mo`;
    if (period === 'weekly') return `${formatted}/wk`;
    return `${formatted}/hr`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-gray-500">{t('offerCompare.loadingOffers')}</div>
      </div>
    );
  }

  if (loadError) {
    // The plan gate renders inside the page; any other failure can be retried.
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        {getGqlErrorCode(loadError) === PLAN_REQUIRED_CODE ? (
          <UpgradePrompt message={getErrorMessage(loadError)} />
        ) : (
          <ErrorState error={loadError} onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('offers.title')}</h1>
        <div className="flex items-center gap-3">
          <QuotaHint resource="offers" used={offers.length} />
          <button
            onClick={openCreate}
            disabled={offersFull}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon className="size-4" />
            {t('offers.addOffer')}
          </button>
        </div>
      </div>

      {(showForm || editingOffer) && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-gray-100">
            {editingOffer ? t('offers.editOffer') : t('offers.newOffer')}
          </h2>
          <OfferForm
            initialData={editingOffer ?? undefined}
            onSubmit={editingOffer ? handleUpdate : handleCreate}
            onCancel={() => {
              setShowForm(false);
              setEditingOffer(null);
            }}
            loading={createOffer.isPending || updateOffer.isPending}
          />
          {editingOffer
            ? updateOffer.error && <WriteError error={updateOffer.error} />
            : createOffer.error && <WriteError error={createOffer.error} />}
        </div>
      )}

      {removeOffer.error && <WriteError error={removeOffer.error} />}

      {offers.length === 0 && !showForm ? (
        <EmptyState className="py-12" message={t('offers.noOffersYet')} />
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatSalary(offer.baseSalary, offer.currency, offer.period)}
                  </div>
                  {offer.bonus && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      + {formatSalary(offer.bonus, offer.currency, offer.period)}{' '}
                      {t('offerCompare.bonusSuffix')}
                    </div>
                  )}
                  {offer.equity && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {t('offers.equityLabel', { equity: offer.equity })}
                    </div>
                  )}
                  {offer.benefits && (
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {t('offers.benefitsLabel', { benefits: offer.benefits })}
                    </div>
                  )}
                  {offer.notes && (
                    <div className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                      {offer.notes}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(offer)}
                    className="p-1.5 text-gray-400 transition-colors hover:text-blue-600"
                  >
                    <PencilIcon className="size-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(offer.id)}
                    disabled={removeOffer.isPending}
                    className="p-1.5 text-gray-400 transition-colors hover:text-red-600 disabled:opacity-60"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
