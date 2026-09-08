import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DETAIL_SECTION_GROUPS } from '../lib/detailSections';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface Props {
  onSelect: (slug: string) => void;
}

/**
 * The detail screen's index of all nine sections, grouped as Track /
 * Documents / Outcome (mirroring web's `SECTION_GROUPS`), each row
 * navigating into its own drilled-down screen. Replaces the flat
 * `SectionTabBar` that only scaled to four items (JEF-303).
 */
export function SectionIndexList({ onSelect }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container} testID="section-index-list">
      {DETAIL_SECTION_GROUPS.map((group) => (
        <View key={group.titleKey} style={styles.group}>
          <Text style={styles.groupTitle}>{t(group.titleKey)}</Text>
          <View style={styles.card}>
            {group.sections.map((section, index) => (
              <Pressable
                key={section.key}
                style={[styles.row, index > 0 && styles.rowBorder]}
                onPress={() => onSelect(section.slug)}
                testID={`section-index-${section.key}`}
              >
                <Text style={styles.rowLabel}>{t(section.labelKey)}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 16 },
    group: { gap: 8 },
    groupTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    rowLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    chevron: { fontSize: 18, color: colors.textFaint },
  });
}
