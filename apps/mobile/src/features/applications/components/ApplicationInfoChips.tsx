import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Application } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/**
 * Tags plus a follow-up reminder chip, matching web's `ApplicationInfoChips`
 * (JEF-303). The follow-up chip switches to a warning tone once the date is
 * due (`followUpAt <= now`), same threshold web uses.
 */
export function ApplicationInfoChips({ application }: { application: Application }) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const followUpDue = application.followUpAt
    ? new Date(application.followUpAt) <= new Date()
    : false;

  if (application.tags.length === 0 && !application.followUpAt) return null;

  return (
    <View style={styles.row} testID="application-info-chips">
      {application.followUpAt ? (
        <View
          style={[styles.chip, followUpDue ? styles.chipWarning : styles.chipNeutral]}
          testID="follow-up-chip"
        >
          <Text style={[styles.chipText, followUpDue && styles.chipTextWarning]}>
            {t('detail.followUpLabel')} {new Date(application.followUpAt).toLocaleDateString()}
          </Text>
        </View>
      ) : null}
      {application.tags.map((tag) => (
        <View key={tag} style={styles.tagChip}>
          <Text style={styles.tagChipText}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    chipNeutral: { backgroundColor: colors.surfaceAlt },
    chipWarning: { backgroundColor: '#fef3c7' },
    chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    chipTextWarning: { color: '#92400e' },
    tagChip: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.primarySurface,
    },
    tagChipText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  });
}
