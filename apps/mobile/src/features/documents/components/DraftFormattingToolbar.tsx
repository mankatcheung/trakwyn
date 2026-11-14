import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  insertLink,
  toggleLinePrefix,
  wrapSelection,
  type Selection,
  type TextEdit,
} from '../lib/markdownEditing';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface DraftFormattingToolbarProps {
  text: string;
  selection: Selection;
  onEdit: (edit: TextEdit) => void;
  disabled?: boolean;
}

/**
 * The Markdown-marker buttons above the draft editor (JEF-589). Scrollable
 * rather than wrapped, every button labelled for VoiceOver and TalkBack, and a
 * link button that asks for the URL in a row of its own.
 */
export function DraftFormattingToolbar({
  text,
  selection,
  onEdit,
  disabled,
}: DraftFormattingToolbarProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkInvalid, setLinkInvalid] = useState(false);
  // The selection the link applies to: the editor loses focus while the URL is typed.
  const [linkSelection, setLinkSelection] = useState<Selection>({ start: 0, end: 0 });

  const button = (
    testID: string,
    label: string,
    a11yKey: string,
    edit: () => TextEdit,
    labelStyle: object = styles.buttonText,
  ) => (
    <Pressable
      style={styles.button}
      onPress={() => onEdit(edit())}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t(a11yKey)}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
    >
      <Text style={labelStyle} importantForAccessibility="no-hide-descendants">
        {label}
      </Text>
    </Pressable>
  );

  const closeLink = () => {
    setLinkOpen(false);
    setUrl('');
    setLinkInvalid(false);
  };

  const submitLink = () => {
    const edit = insertLink(text, linkSelection, url);
    if (!edit) {
      setLinkInvalid(true);
      return;
    }
    closeLink();
    onEdit(edit);
  };

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.toolbar}
        testID="draft-toolbar"
      >
        {button(
          'toolbar-bold',
          'B',
          'toolbarBold',
          () => wrapSelection(text, selection, '**'),
          styles.buttonBold,
        )}
        {button(
          'toolbar-italic',
          'I',
          'toolbarItalic',
          () => wrapSelection(text, selection, '*'),
          styles.buttonItalic,
        )}
        {button(
          'toolbar-strike',
          'S',
          'toolbarStrike',
          () => wrapSelection(text, selection, '~~'),
          styles.buttonStrike,
        )}
        <View style={styles.divider} />
        {button('toolbar-h1', 'H1', 'toolbarH1', () => toggleLinePrefix(text, selection, '# '))}
        {button('toolbar-h2', 'H2', 'toolbarH2', () => toggleLinePrefix(text, selection, '## '))}
        {button('toolbar-h3', 'H3', 'toolbarH3', () => toggleLinePrefix(text, selection, '### '))}
        <View style={styles.divider} />
        {button('toolbar-bullet-list', '• ≡', 'toolbarBulletList', () =>
          toggleLinePrefix(text, selection, '- '),
        )}
        {button('toolbar-ordered-list', '1. ≡', 'toolbarOrderedList', () =>
          toggleLinePrefix(text, selection, '1. '),
        )}
        {button('toolbar-quote', '❝', 'toolbarQuote', () =>
          toggleLinePrefix(text, selection, '> '),
        )}
        <View style={styles.divider} />
        <Pressable
          style={styles.button}
          onPress={() => {
            setLinkSelection(selection);
            setLinkOpen((open) => !open);
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('toolbarLink')}
          accessibilityState={{ disabled: Boolean(disabled), expanded: linkOpen }}
          testID="toolbar-link"
        >
          <Text style={styles.buttonText} importantForAccessibility="no-hide-descendants">
            🔗
          </Text>
        </Pressable>
      </ScrollView>

      {linkOpen ? (
        <View style={styles.linkRow} testID="toolbar-link-row">
          <TextInput
            style={styles.linkInput}
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setLinkInvalid(false);
            }}
            placeholder={t('linkUrlPlaceholder')}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={t('linkUrlLabel')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={submitLink}
            autoFocus
            testID="toolbar-link-input"
          />
          <Pressable
            onPress={submitLink}
            hitSlop={8}
            accessibilityRole="button"
            testID="toolbar-link-insert"
          >
            <Text style={styles.linkAction}>{t('linkInsert')}</Text>
          </Pressable>
          <Pressable
            onPress={closeLink}
            hitSlop={8}
            accessibilityRole="button"
            testID="toolbar-link-cancel"
          >
            <Text style={styles.linkCancel}>{t('cancel')}</Text>
          </Pressable>
        </View>
      ) : null}
      {linkOpen && linkInvalid ? (
        <Text style={styles.linkError} accessibilityRole="alert" testID="toolbar-link-invalid">
          {t('linkInvalid')}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    disabled: { opacity: 0.5 },
    button: {
      minWidth: 36,
      height: 36,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    buttonText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
    buttonBold: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
    buttonItalic: {
      fontSize: 14,
      fontWeight: '700',
      fontStyle: 'italic',
      color: colors.textMuted,
    },
    buttonStrike: {
      fontSize: 14,
      fontWeight: '700',
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    divider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    linkInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: colors.background,
    },
    linkAction: { fontSize: 14, fontWeight: '700', color: colors.primary },
    linkCancel: { fontSize: 14, color: colors.textMuted },
    linkError: { paddingHorizontal: 12, paddingBottom: 10, fontSize: 13, color: colors.danger },
  });
}
