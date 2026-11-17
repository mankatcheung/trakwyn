import { useState, type ComponentProps } from 'react';
import { Input } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';

type PasswordFieldProps = Omit<ComponentProps<typeof Input>, 'type'>;

/** A password input with a show/hide toggle, so a typo can be spotted without a confirm field. */
export function PasswordField(props: PasswordFieldProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-16" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        {visible ? t('registerPage.hidePassword') : t('registerPage.showPassword')}
      </button>
    </div>
  );
}
