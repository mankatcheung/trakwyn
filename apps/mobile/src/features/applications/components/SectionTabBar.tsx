import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

export interface SectionTabItem {
  key: string;
  label: string;
}

interface Props {
  items: SectionTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** `underline` matches the detail screen's top-level tabs; `pill` matches the sub-screens. */
  variant?: 'underline' | 'pill';
}

export function SectionTabBar({ items, activeKey, onSelect, variant = 'pill' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (variant === 'underline') {
    return (
      <View style={styles.underlineRow} testID="section-tab-bar">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Pressable
              key={item.key}
              style={styles.underlineTab}
              onPress={() => onSelect(item.key)}
              testID={`section-tab-${item.key}`}
            >
              <Text style={[styles.underlineText, active && styles.underlineTextActive]}>
                {item.label}
              </Text>
              {active ? <View style={styles.underlineIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pillScroll}
      contentContainerStyle={styles.pillRow}
      testID="section-tab-bar"
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onSelect(item.key)}
            testID={`section-tab-${item.key}`}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    underlineRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    underlineTab: { paddingVertical: 10, marginRight: 20, alignItems: 'center' },
    underlineText: { fontSize: 14, fontWeight: '600', color: colors.textSubtle },
    underlineTextActive: { color: colors.primary },
    underlineIndicator: {
      marginTop: 8,
      height: 2,
      width: '100%',
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    pillScroll: { flexGrow: 0, flexShrink: 0 },
    pillRow: { gap: 8, alignItems: 'center', paddingVertical: 2 },
    pill: {
      borderRadius: 9999,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surfaceAlt,
    },
    pillActive: { backgroundColor: colors.primary },
    pillText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    pillTextActive: { color: colors.onPrimary },
  });
}
