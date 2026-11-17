import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormLabel, Input, Select, SubmitButton, Textarea, Button } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { useFormAction } from '#/hooks/useFormAction';
import { offerFormSchema, type OfferFormData, type OfferFormInput } from '../lib/offerFormSchema';

interface OfferFormProps {
  initialData?: {
    baseSalary?: number;
    bonus?: number | null;
    equity?: string | null;
    benefits?: string | null;
    costOfLivingAdjustment?: number | null;
    currency?: string;
    period?: string;
    notes?: string | null;
  };
  /** The parent saves the offer and shows its own error; the form waits for it. */
  onSubmit: (data: OfferFormData) => void | Promise<void>;
  onCancel: () => void;
  /** Keeps the button busy while the parent still saves (before the form's own pending state). */
  loading?: boolean;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'HKD', 'TWD', 'CNY'];
const PERIODS = ['yearly', 'monthly', 'weekly', 'hourly'];

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export function OfferForm({ initialData, onSubmit, onCancel, loading }: OfferFormProps) {
  const { t } = useLocale();
  const form = useForm<OfferFormInput, unknown, OfferFormData>({
    resolver: zodResolver(offerFormSchema),
    defaultValues: {
      baseSalary: String(initialData?.baseSalary ?? 0),
      bonus: initialData?.bonus == null ? '' : String(initialData.bonus),
      equity: initialData?.equity ?? '',
      benefits: initialData?.benefits ?? '',
      costOfLivingAdjustment:
        initialData?.costOfLivingAdjustment == null
          ? ''
          : String(initialData.costOfLivingAdjustment),
      currency: initialData?.currency ?? 'USD',
      period: initialData?.period ?? 'yearly',
      notes: initialData?.notes ?? '',
    },
  });
  const { register } = form;
  const { errors } = form.formState;

  const { formProps } = useFormAction(form, async (data) => {
    await onSubmit(data);
    return null;
  });

  return (
    <form {...formProps} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>{t('offerForm.baseSalaryLabel')}</FormLabel>
          <Input type="number" invalid={!!errors.baseSalary} {...register('baseSalary')} />
          <FieldError message={errors.baseSalary?.message} />
        </div>
        <div>
          <FormLabel>{t('offerForm.bonusLabel')}</FormLabel>
          <Input type="number" invalid={!!errors.bonus} {...register('bonus')} />
          <FieldError message={errors.bonus?.message} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>{t('offerForm.currencyLabel')}</FormLabel>
          <Select {...register('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FormLabel>{t('offerForm.periodLabel')}</FormLabel>
          <Select {...register('period')}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`offerForm.${p}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <FormLabel>{t('offerForm.equityLabel')}</FormLabel>
        <Input type="text" placeholder={t('offerForm.equityPlaceholder')} {...register('equity')} />
      </div>

      <div>
        <FormLabel>{t('offerForm.benefitsLabel')}</FormLabel>
        <Textarea
          placeholder={t('offerForm.benefitsPlaceholder')}
          rows={2}
          {...register('benefits')}
        />
      </div>

      <div>
        <FormLabel>{t('offerForm.costOfLivingLabel')}</FormLabel>
        <Input
          type="number"
          invalid={!!errors.costOfLivingAdjustment}
          {...register('costOfLivingAdjustment')}
        />
        <FieldError message={errors.costOfLivingAdjustment?.message} />
      </div>

      <div>
        <FormLabel>{t('offerForm.notesLabel')}</FormLabel>
        <Textarea rows={2} {...register('notes')} />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <SubmitButton pending={loading} pendingLabel={t('applicationForm.saving')}>
          {t('offerForm.saveOffer')}
        </SubmitButton>
      </div>
    </form>
  );
}
