import { useEffect, useId, useRef, useState } from 'react';
import { CheckIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Checkbox, Modal } from '@trakwyn/ui';
import { useLocale } from '#/lib/i18n';
import {
  APPLICATION_DISPLAY_FIELDS,
  type ApplicationDisplayField,
  type ApplicationDisplayFields,
} from '#/features/applications/lib/applicationDisplayFields';
import { useMediaQuery } from '#/hooks/useMediaQuery';

const FIELD_LABEL_KEYS: Record<ApplicationDisplayField, string> = {
  role: 'applications.displayFields.role',
  location: 'applications.displayFields.location',
  date: 'applications.displayFields.date',
  tags: 'applications.displayFields.tags',
  status: 'applications.displayFields.status',
  starred: 'applications.displayFields.starred',
  ghosted: 'applications.displayFields.ghosted',
};

interface ApplicationDisplayFieldsPickerProps {
  fields: ApplicationDisplayFields;
  onToggle: (field: ApplicationDisplayField) => void;
  className?: string;
}

/**
 * The JEF-230 control: a picker of checkboxes deciding which detail fields
 * the applications list rows and board cards render. The preference is shared
 * by both views (same localStorage entry), so the picker is the one component
 * both pages mount.
 *
 * Desktop gets an anchored popover; below the sm breakpoint it becomes a
 * bottom sheet instead (JEF-232), matching ApplicationActionsSheet — a popup
 * anchored to a corner is cramped on a phone, and tapping one of its own
 * checkboxes would trip the click-away dismissal. The sheet's rows are 56px
 * touch targets and dismiss via backdrop or Escape like every other sheet.
 */
export function ApplicationDisplayFieldsPicker({
  fields,
  onToggle,
  className = '',
}: ApplicationDisplayFieldsPickerProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 640px)');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Click-away only guards the popover; on mobile there is nothing anchored
  // to protect — the Modal's backdrop is the dismissal surface.
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, isDesktop]);

  const fieldLabel = (field: ApplicationDisplayField) => t(FIELD_LABEL_KEYS[field]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={isDesktop && open ? panelId : undefined}
        aria-label={t('applications.displayFields.pickerAria')}
        title={t('applications.displayFields.title')}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:text-gray-800 dark:border-gray-700 dark:hover:text-gray-200 ${
          open ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        <SlidersHorizontalIcon size={15} />
        <span className="hidden sm:inline">{t('applications.displayFields.title')}</span>
      </button>

      {open && isDesktop && (
        <div
          id={panelId}
          role="group"
          aria-label={t('applications.displayFields.title')}
          className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
            {t('applications.displayFields.title')}
          </p>
          <ul className="space-y-1">
            {APPLICATION_DISPLAY_FIELDS.map((field) => (
              <li key={field}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 select-none hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50">
                  <Checkbox
                    checked={fields[field]}
                    onChange={() => onToggle(field)}
                    aria-label={fieldLabel(field)}
                  />
                  {fieldLabel(field)}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-gray-400 dark:text-gray-500">
            <CheckIcon size={11} aria-hidden="true" />
            {t('applications.displayFields.companyAlwaysShown')}
          </p>
        </div>
      )}

      {open && !isDesktop && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          position="bottom"
          ariaLabel={t('applications.displayFields.pickerAria')}
        >
          <div className="flex flex-col pb-2">
            <div className="flex justify-center py-2.5">
              <div className="h-1 w-9 rounded-full bg-gray-200 dark:bg-gray-600" />
            </div>
            {APPLICATION_DISPLAY_FIELDS.map((field) => (
              <label
                key={field}
                className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-3 text-left text-[15px] text-gray-900 transition-colors select-none hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/50"
                style={{ minHeight: '56px' }}
              >
                <Checkbox
                  checked={fields[field]}
                  onChange={() => onToggle(field)}
                  aria-label={fieldLabel(field)}
                />
                <span className="flex-1">{fieldLabel(field)}</span>
              </label>
            ))}
            <p className="mt-1 flex items-center gap-1.5 px-5 pb-1 text-[11px] text-gray-400 dark:text-gray-500">
              <CheckIcon size={11} aria-hidden="true" />
              {t('applications.displayFields.companyAlwaysShown')}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
