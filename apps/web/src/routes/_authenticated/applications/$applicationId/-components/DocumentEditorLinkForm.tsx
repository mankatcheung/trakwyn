import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useLocale } from '#/lib/i18n';
import { normalizeLinkInput } from '#/lib/editorLinks';

/** The address field under the toolbar and inside the bubble menu. */
export function DocumentEditorLinkForm({
  editor,
  initial,
  hasLink,
  onClose,
}: {
  editor: Editor;
  initial: string;
  hasLink: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const href = normalizeLinkInput(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  };

  return (
    <form
      role="group"
      aria-label={t('documents.editor.link')}
      className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-1.5 py-1.5 dark:border-gray-700"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
          editor.commands.focus();
        }
      }}
    >
      <input
        autoFocus
        type="text"
        inputMode="url"
        value={value}
        aria-label={t('documents.editor.linkUrl')}
        aria-invalid={invalid}
        aria-describedby={invalid ? 'editor-link-error' : undefined}
        placeholder="https://"
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
        className="min-w-0 flex-1 rounded-sm border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <button
        type="submit"
        className="cursor-pointer rounded-sm bg-blue-600 px-2 py-1 text-sm text-white hover:bg-blue-700"
      >
        {t('documents.editor.linkApply')}
      </button>
      {hasLink && (
        <button
          type="button"
          onClick={remove}
          className="cursor-pointer rounded-sm px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {t('documents.editor.linkRemove')}
        </button>
      )}
      {invalid && (
        <p id="editor-link-error" role="alert" className="w-full text-xs text-red-600">
          {t('documents.editor.linkInvalid')}
        </p>
      )}
    </form>
  );
}
