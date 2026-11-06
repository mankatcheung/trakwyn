import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
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

/** The Markdown-marker buttons above the draft editor. */
export function DraftFormattingToolbar({
  text,
  selection,
  onEdit,
  disabled,
}: DraftFormattingToolbarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const button = (
    testID: string,
    label: string,
    edit: () => TextEdit,
    labelStyle: object = styles.buttonText,
  ) => (
    <Pressable
      style={styles.button}
      onPress={() => onEdit(edit())}
      disabled={disabled}
      testID={testID}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.toolbar, disabled && styles.disabled]}>
      {button('toolbar-bold', 'B', () => wrapSelection(text, selection, '**'), styles.buttonBold)}
      {button(
        'toolbar-italic',
        'I',
        () => wrapSelection(text, selection, '*'),
        styles.buttonItalic,
      )}
      <View style={styles.divider} />
      {button('toolbar-h1', 'H1', () => toggleLinePrefix(text, selection, '# '))}
      {button('toolbar-h2', 'H2', () => toggleLinePrefix(text, selection, '## '))}
      {button('toolbar-h3', 'H3', () => toggleLinePrefix(text, selection, '### '))}
      <View style={styles.divider} />
      {button('toolbar-bullet-list', '• ≡', () => toggleLinePrefix(text, selection, '- '))}
      {button('toolbar-ordered-list', '1. ≡', () => toggleLinePrefix(text, selection, '1. '))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    disabled: { opacity: 0.5 },
    button: {
      minWidth: 32,
      height: 32,
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
    divider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 },
  });
}
