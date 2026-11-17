import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Card, FormLabel, Input, Select, SubmitButton, Textarea } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { useFormAction } from '#/hooks/useFormAction';
import { ROUND_OUTCOMES, ROUND_TYPES, roundSchema, type RoundFormState } from '../lib/roundForm';

interface RoundFormProps {
  initial: RoundFormState;
  /** Saves the round. A rejection is shown under the form and keeps what was typed. */
  onSave: (values: RoundFormState) => Promise<unknown>;
  onCancel: () => void;
}

export function RoundForm({ initial, onSave, onCancel }: RoundFormProps) {
  const { t } = useLocale();
  const form = useForm<RoundFormState>({
    resolver: zodResolver(roundSchema),
    defaultValues: initial,
  });
  const { register } = form;

  const { state, formProps } = useFormAction(form, async (values) => {
    try {
      await onSave(values);
    } catch (error) {
      return getErrorMessage(error);
    }
  });

  return (
    <form {...formProps}>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FormLabel size="xs">{t('interviews.typeLabel')}</FormLabel>
            <Select {...register('type')}>
              {ROUND_TYPES.map((roundType) => (
                <option key={roundType} value={roundType}>
                  {t(`interviews.${roundType}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FormLabel size="xs">{t('interviews.outcomeLabel')}</FormLabel>
            <Select {...register('outcome')}>
              {ROUND_OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {t(`interviews.${outcome}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <FormLabel size="xs">{t('interviews.scheduledAtLabel')}</FormLabel>
          <Input type="datetime-local" {...register('scheduledAt')} />
        </div>
        <div>
          <FormLabel size="xs">{t('interviews.interviewerLabel')}</FormLabel>
          <Input
            {...register('interviewerName')}
            placeholder={t('interviews.interviewerPlaceholder')}
          />
        </div>
        <div>
          <FormLabel size="xs">{t('interviews.notesLabel')}</FormLabel>
          <Textarea
            {...register('notes')}
            className="h-20"
            placeholder={t('interviews.notesPlaceholder')}
          />
        </div>
        {state.error && <Alert>{state.error}</Alert>}
        <div className="flex justify-end gap-2">
          <SubmitButton size="sm" pendingLabel={t('applicationForm.saving')}>
            {t('common.save')}
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </Card>
    </form>
  );
}
