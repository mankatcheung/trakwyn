import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { LanguageMode } from '../../../i18n/config';

export function LanguageScreen() {
  const { t } = useTranslation('settingsLanguage');
  const { mode, supportedLanguages, setMode } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const options: { value: LanguageMode; label: string }[] = [
    { value: 'system', label: t('systemOption') },
    ...supportedLanguages.map((language) => ({
      value: language.code as LanguageMode,
      label: language.nativeLabel,
    })),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('title')}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.chip, mode === option.value && styles.chipActive]}
            onPress={() => setMode(option.value)}
            testID={`language-${option.value}`}
          >
            <Text style={[styles.chipText, mode === option.value && styles.chipTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 10 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
    chipTextActive: { color: colors.onPrimary },
  });
}
