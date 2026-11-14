import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { PluginKey } from '@tiptap/pm/state';
import { LinkIcon, RemoveFormattingIcon, SparklesIcon } from 'lucide-react';
import { useLocale } from '#/lib/i18n';
import { ToolbarButton } from './EditorToolbarButton';
import { DocumentEditorLinkForm } from './DocumentEditorLinkForm';
import { InlineAiForm } from './InlineAiForm';
import { describeRange, type AiRange } from '#/lib/editor/selectionRange';
import type { InlineAiRequest } from '#/lib/editor/aiActions';
import { MARK_COMMANDS, readMarkState, runMarkCommand } from './editorMarkCommands';

const BUBBLE_MENU_KEY = new PluginKey('documentBubbleMenu');

/** A finger on the screen already has the system's selection handles and menu. */
const isTouchPrimary = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/**
 * The small formatting menu beside a text selection (JEF-574). It offers the
 * same mark commands as the toolbar (`editorMarkCommands`), plus a link and
 * "clear formatting". Focus stays in the editor: the buttons do not take it on
 * mouse down, and Escape closes the menu without touching the selection.
 */
export function DocumentEditorBubbleMenu({
  editor,
  editable,
  ai,
}: {
  editor: Editor;
  editable: boolean;
  /** The inline AI actions on the selection (JEF-583). Without it the menu has no AI button. */
  ai?: { run: (request: InlineAiRequest, range: AiRange | null) => void };
}) {
  const { t } = useLocale();
  const [linkOpen, setLinkOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // What an AI action could replace for the current selection, or null.
  const aiRange = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      describeRange(e.state.doc, e.state.selection.from, e.state.selection.to),
  });
  // The selection Escape closed the menu for; a different selection shows it again.
  const dismissedFor = useRef<string | null>(null);
  const state = useEditorState({ editor, selector: ({ editor: e }) => readMarkState(e) });

  const shouldShow = useCallback(
    ({
      editor: e,
      element,
      view,
      state: s,
    }: {
      editor: Editor;
      element: HTMLElement;
      view: Editor['view'];
      state: Editor['state'];
    }) => {
      const { from, to, empty } = s.selection;
      if (!editable || empty || isTouchPrimary()) return false;
      if (dismissedFor.current === `${from}:${to}`) return false;
      if (e.isActive('codeBlock') || s.doc.textBetween(from, to).trim() === '') return false;
      return view.hasFocus() || element.contains(document.activeElement);
    },
    [editable],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const { from, to, empty } = editor.state.selection;
      if (empty) return;
      dismissedFor.current = `${from}:${to}`;
      editor.view.dispatch(editor.state.tr.setMeta(BUBBLE_MENU_KEY, 'hide'));
    };
    const closeForm = () => {
      setLinkOpen(false);
      setAiOpen(false);
    };
    editor.view.dom.addEventListener('keydown', onKeyDown);
    editor.on('selectionUpdate', closeForm);
    return () => {
      editor.view.dom.removeEventListener('keydown', onKeyDown);
      editor.off('selectionUpdate', closeForm);
    };
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={BUBBLE_MENU_KEY}
      shouldShow={shouldShow}
      updateDelay={100}
      options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }}
      className="z-40 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setLinkOpen(false);
        setAiOpen(false);
        editor.chain().focus().run();
      }}
    >
      <div
        role="toolbar"
        aria-label={t('documents.editor.bubbleMenu')}
        className="flex items-center gap-0.5 p-1"
        // Keep the selection and focus in the editor while a button is pressed.
        onMouseDown={(event) => event.preventDefault()}
      >
        {MARK_COMMANDS.filter(({ id }) => id !== 'strike').map(
          ({ id, labelKey, shortcut, Icon }) => (
            <ToolbarButton
              key={id}
              label={t(labelKey)}
              shortcut={shortcut}
              pressed={state[id]}
              onClick={() => runMarkCommand(editor, id)}
            >
              <Icon className="size-4" />
            </ToolbarButton>
          ),
        )}
        <ToolbarButton
          label={t('documents.editor.link')}
          pressed={state.link || linkOpen}
          onClick={() => {
            setAiOpen(false);
            setLinkOpen((open) => !open);
          }}
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>
        {ai && (
          <ToolbarButton
            label={t('documents.editor.ai.title')}
            pressed={aiOpen}
            onClick={() => {
              setLinkOpen(false);
              setAiOpen((open) => !open);
            }}
          >
            <SparklesIcon className="size-4" />
          </ToolbarButton>
        )}
        <ToolbarButton
          label={t('documents.editor.clearFormatting')}
          onClick={() => editor.chain().focus().unsetAllMarks().run()}
        >
          <RemoveFormattingIcon className="size-4" />
        </ToolbarButton>
      </div>
      {ai && aiOpen && (
        <InlineAiForm
          canRun={aiRange !== null}
          hint={t('documents.editor.ai.selectBlocks')}
          onRun={(request) => {
            setAiOpen(false);
            ai.run(request, aiRange);
          }}
        />
      )}
      {linkOpen && (
        <DocumentEditorLinkForm
          key={state.linkHref}
          editor={editor}
          initial={state.linkHref}
          hasLink={state.link}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </BubbleMenu>
  );
}
