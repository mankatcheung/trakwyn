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

  const OPTIONS: { value: LanguageMode; label: string }[] = [
    { value: 'system', label: t('systemOption') },
    ...supportedLanguages.map((language) => ({
      value: language.code as LanguageMode,
      label: language.nativeLabel,
    })),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('title')}</Text>
      <View style={styles.optionList}>
        {OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setMode(option.value)}
              testID={`language-${option.value}`}
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
