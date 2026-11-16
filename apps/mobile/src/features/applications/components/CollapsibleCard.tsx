import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { ChevronDownIcon, ChevronUpIcon } from './ApplicationIcons';

interface CollapsibleCardProps {
  title: string;
  /** Shown beside the title, such as a count or a seniority. */
  badge?: string | null;
  defaultExpanded?: boolean;
  testID: string;
  children: React.ReactNode;
}

/** A card whose body opens from its header, so the detail screen stays short. */
export function CollapsibleCard({
  title,
  badge,
  defaultExpanded = false,
  testID,
  children,
}: CollapsibleCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Chevron = expanded ? ChevronUpIcon : ChevronDownIcon;

  return (
    <View style={styles.card} testID={testID}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
        testID={`${testID}-toggle`}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Chevron color={colors.textSubtle} size={16} />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    title: { fontSize: 15, fontWeight: '700', color: colors.text },
    badge: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 9999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    badgeText: { fontSize: 11, fontWeight: '600', color: colors.textSubtle },
    body: { gap: 12 },
  });
}
