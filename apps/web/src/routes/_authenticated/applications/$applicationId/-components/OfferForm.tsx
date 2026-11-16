import { useState } from 'react';
import { useLocale } from '#/lib/i18n';
import { Button, FormLabel, Input, Select, Textarea } from '@trakwyn/ui';

interface OfferFormData {
  baseSalary: number;
  bonus: number | null;
  equity: string;
  benefits: string;
  costOfLivingAdjustment: number | null;
  currency: string;
  period: string;
  notes: string;
}

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
  onSubmit: (data: OfferFormData) => void;
  onCancel: () => void;
  loading?: boolean;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'HKD', 'TWD', 'CNY'];
const PERIODS = ['yearly', 'monthly', 'weekly', 'hourly'];

export function OfferForm({ initialData, onSubmit, onCancel, loading }: OfferFormProps) {
  const { t } = useLocale();
  const [formData, setFormData] = useState<OfferFormData>({
    baseSalary: initialData?.baseSalary ?? 0,
    bonus: initialData?.bonus ?? null,
    equity: initialData?.equity ?? '',
    benefits: initialData?.benefits ?? '',
    costOfLivingAdjustment: initialData?.costOfLivingAdjustment ?? null,
    currency: initialData?.currency ?? 'USD',
    period: initialData?.period ?? 'yearly',
    notes: initialData?.notes ?? '',
  });

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>{t('offerForm.baseSalaryLabel')}</FormLabel>
          <Input
            type="number"
            value={formData.baseSalary}
            onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
            required
            min={0}
          />
        </div>
        <div>
          <FormLabel>{t('offerForm.bonusLabel')}</FormLabel>
          <Input
            type="number"
            value={formData.bonus ?? ''}
            onChange={(e) =>
              setFormData({ ...formData, bonus: e.target.value ? Number(e.target.value) : null })
            }
            min={0}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <FormLabel>{t('offerForm.currencyLabel')}</FormLabel>
          <Select
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FormLabel>{t('offerForm.periodLabel')}</FormLabel>
          <Select
            value={formData.period}
            onChange={(e) => setFormData({ ...formData, period: e.target.value })}
          >
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
        <Input
          type="text"
          value={formData.equity}
          onChange={(e) => setFormData({ ...formData, equity: e.target.value })}
          placeholder={t('offerForm.equityPlaceholder')}
        />
      </div>

      <div>
        <FormLabel>{t('offerForm.benefitsLabel')}</FormLabel>
        <Textarea
          value={formData.benefits}
          onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
          placeholder={t('offerForm.benefitsPlaceholder')}
          rows={2}
        />
      </div>

      <div>
        <FormLabel>{t('offerForm.costOfLivingLabel')}</FormLabel>
        <Input
          type="number"
          value={formData.costOfLivingAdjustment ?? ''}
          onChange={(e) =>
            setFormData({
              ...formData,
              costOfLivingAdjustment: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
      </div>

      <div>
        <FormLabel>{t('offerForm.notesLabel')}</FormLabel>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={loading || formData.baseSalary <= 0}>
          {loading ? t('applicationForm.saving') : t('offerForm.saveOffer')}
        </Button>
      </div>
    </form>
  );
}
