import { useId, type ReactNode } from 'react';
import { FormLabel, Input } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import { MONTH } from '../../../lib/cvImportDrafts';

interface FieldProps {
  label: string;
  className?: string;
  children: (id: string) => ReactNode;
}

/** A label tied to its input, with an id that is unique however many rows are open. */
export function Field({ label, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={className}>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      {children(id)}
    </div>
  );
}

interface MonthFieldProps {
  label: string;
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

/** A month the CV may not give: blank is fine, a value must be a month. */
export function MonthField({ label, value, invalid, onChange }: MonthFieldProps) {
  return (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="month"
          value={value}
          invalid={(value !== '' && !MONTH.test(value)) || invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

interface DateFieldsProps {
  start: string;
  end: string;
  hint: string;
  onChange: (patch: { startDate?: string; endDate?: string }) => void;
}

export function DateFields({ start, end, hint, onChange }: DateFieldsProps) {
  const { t } = useLocale();
  return (
    <>
      <Field label={t('experience.startDateLabel')}>
        {(id) => (
          <Input
            id={id}
            type="month"
            value={start}
            invalid={!MONTH.test(start)}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        )}
      </Field>
      <Field label={t('experience.endDateLabel')}>
        {(id) => (
          <>
            <Input
              id={id}
              type="month"
              value={end}
              invalid={end !== '' && (!MONTH.test(end) || end < start)}
              onChange={(e) => onChange({ endDate: e.target.value })}
            />
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{hint}</p>
          </>
        )}
      </Field>
    </>
  );
}
