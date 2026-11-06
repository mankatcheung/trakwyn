import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Markdown } from '../../../components/Markdown';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface PolishPreviewProps {
  markdown: string;
  onReplace: () => void;
  onInsert: () => void;
  onDiscard: () => void;
  /** The draft changed after this was written: replacing it would drop those edits. */
  stale?: boolean;
}

/** The polished text with nothing applied until a button is pressed (JEF-508). */
export function PolishPreview({
  markdown,
  onReplace,
  onInsert,
  onDiscard,
  stale,
}: PolishPreviewProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card} testID="polish-preview">
      <Text style={styles.title}>{t('aiPreviewTitle')}</Text>
      <ScrollView style={styles.body} nestedScrollEnabled>
        <Markdown content={markdown} />
      </ScrollView>
      {stale ? (
        <Text style={styles.stale} testID="polish-preview-stale">
          {t('aiStale')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {stale ? null : (
          <Pressable style={styles.primary} onPress={onReplace} testID="polish-replace">
            <Text style={styles.primaryText}>{t('aiReplace')}</Text>
          </Pressable>
        )}
        <Pressable style={styles.secondary} onPress={onInsert} testID="polish-insert">
          <Text style={styles.secondaryText}>{t('aiInsertBelow')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={onDiscard} testID="polish-discard">
          <Text style={styles.secondaryText}>{t('aiDiscard')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      gap: 10,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    title: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
    body: { maxHeight: 240 },
    stale: { fontSize: 12, color: colors.warning },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    primary: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    primaryText: { color: colors.onPrimary, fontWeight: '600', fontSize: 14 },
    secondary: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    secondaryText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  });
}
