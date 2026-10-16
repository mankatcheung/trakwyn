import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DETAIL_SECTION_GROUPS, type DetailSectionDef } from '../lib/detailSections';
import type { SectionCounts } from '../lib/sectionCounts';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface Props {
  onSelect: (slug: string) => void;
  /** Absent until the counts have loaded, so nothing is badged "0" in the meantime. */
  counts?: SectionCounts;
}

/**
 * The detail screen's index of all nine sections, grouped as Track /
 * Documents / Outcome (mirroring web's `SECTION_GROUPS`), each row
 * navigating into its own drilled-down screen. Replaces the flat
 * `SectionTabBar` that only scaled to four items (JEF-303).
 *
 * A list section shows its count (nothing at zero, as on web); Company
 * briefing shows a check once generated and a muted dot until then.
 */
export function SectionIndexList({ onSelect, counts }: Props) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const countFor = (section: DetailSectionDef): number | null =>
    counts && section.countOf ? section.countOf(counts) : null;
  const generatedFor = (section: DetailSectionDef): boolean | null =>
    counts && section.generatedOf ? section.generatedOf(counts) : null;

  return (
    <View style={styles.container} testID="section-index-list">
      {DETAIL_SECTION_GROUPS.map((group) => (
        <View key={group.titleKey} style={styles.group}>
          <Text style={styles.groupTitle}>{t(group.titleKey)}</Text>
          <View style={styles.card}>
            {group.sections.map((section, index) => {
              const count = countFor(section);
              const generated = generatedFor(section);
              return (
                <Pressable
                  key={section.key}
                  style={[styles.row, index > 0 && styles.rowBorder]}
                  onPress={() => onSelect(section.slug)}
                  testID={`section-index-${section.key}`}
                >
                  <Text style={styles.rowLabel}>{t(section.labelKey)}</Text>
                  <View style={styles.trailing}>
                    {count !== null && count > 0 ? (
                      <View style={styles.badge} testID={`section-count-${section.key}`}>
                        <Text style={styles.badgeText}>{count}</Text>
                      </View>
                    ) : null}
                    {generated === true ? (
                      <Text
                        style={styles.check}
                        accessibilityLabel={t('detail.briefingGenerated')}
                        testID={`section-generated-${section.key}`}
                      >
                        ✓
                      </Text>
                    ) : null}
                    {generated === false ? (
                      <View
                        style={styles.dot}
                        accessible
                        accessibilityLabel={t('detail.briefingNotGenerated')}
                        testID={`section-not-generated-${section.key}`}
                      />
                    ) : null}
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </Pressable>
              );
            })}
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
    trailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    badge: {
      minWidth: 22,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 11,
      alignItems: 'center',
      backgroundColor: colors.primarySurface,
    },
    badgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
    check: { fontSize: 15, fontWeight: '700', color: colors.success },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
    chevron: { fontSize: 18, color: colors.textFaint },
  });
}
