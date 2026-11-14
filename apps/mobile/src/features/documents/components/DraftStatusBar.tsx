import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { countDraft } from '../lib/draftStats';
import type { Selection } from '../lib/markdownEditing';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface DraftStatusBarProps {
  text: string;
  selection: Selection;
  saving: boolean;
  /** The last save failed (JEF-508's saver keeps its payload for Retry). */
  failed: boolean;
  /** The draft has been saved at least once this session or was loaded saved. */
  hasSaved: boolean;
  onRetry: () => void;
}

/**
 * One line under the editor (JEF-589): the word and character count on the left
 * (of the selection while text is selected), the save status on the right:
 * Saving…, Saved, or Couldn't save with Retry.
 */
export function DraftStatusBar({
  text,
  selection,
  saving,
  failed,
  hasSaved,
  onRetry,
}: DraftStatusBarProps) {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const count = useMemo(() => countDraft(text, selection), [text, selection]);

  const summary = `${t('statusWords', { count: count.words })} · ${t('statusCharacters', {
    count: count.characters,
  })}`;

  return (
    <View style={styles.bar} testID="draft-status-bar">
      <Text style={styles.count} accessibilityLiveRegion="polite" testID="draft-count">
        {count.selected ? t('statusSelection', { summary }) : summary}
      </Text>
      {saving ? (
        <Text style={styles.saving} testID="draft-status-saving">
          {t('savingEllipsis')}
        </Text>
      ) : failed ? (
        <View style={styles.failedRow}>
          <Text style={styles.failed} testID="draft-status-failed">
            {t('statusFailed')}
          </Text>
          <Pressable
            onPress={onRetry}
            hitSlop={8}
            accessibilityRole="button"
            testID="draft-save-retry"
          >
            <Text style={styles.retry}>{tCommon('retry')}</Text>
          </Pressable>
        </View>
      ) : hasSaved ? (
        <Text style={styles.saved} testID="draft-status-saved">{`✓ ${t('saved')}`}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    count: { flexShrink: 1, fontSize: 12, color: colors.textMuted },
    saving: { fontSize: 12, fontWeight: '600', color: colors.primary },
    saved: { fontSize: 12, fontWeight: '600', color: colors.success },
    failedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    failed: { fontSize: 12, fontWeight: '600', color: colors.danger },
    retry: { fontSize: 12, fontWeight: '700', color: colors.primary },
  });
}
