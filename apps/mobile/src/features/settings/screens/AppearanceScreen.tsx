import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors, ThemeMode } from '../../../theme/colors';

export function AppearanceScreen() {
  const { t } = useTranslation('appearance');
  const { mode, colors, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t('light') },
    { value: 'dark', label: t('dark') },
    { value: 'system', label: t('system') },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('themeLabel')}</Text>
      <View style={styles.optionList}>
        {MODE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setMode(option.value)}
              testID={`appearance-${option.value}`}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option.label}
              </Text>
              {selected ? <Text style={styles.checkmark}>{'✓'}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 10 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text },
    optionList: { gap: 10 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.surface,
    },
    optionSelected: { backgroundColor: colors.primarySurface, borderColor: colors.primary },
    optionText: { fontSize: 15, color: colors.textMuted, fontWeight: '500' },
    optionTextSelected: { color: colors.primary, fontWeight: '700' },
    checkmark: { fontSize: 16, fontWeight: '700', color: colors.primary },
  });
}
