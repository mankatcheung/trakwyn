import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/** What the API accepts for an AI instruction (`AI_PROMPT_INPUT` on the API). */
export const AI_PROMPT_MAX_LENGTH = 500;

interface AiPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  label?: string;
  disabled?: boolean;
  testID?: string;
}

/** An optional instruction box with a character counter. */
export function AiPromptInput({
  value,
  onChange,
  placeholder,
  maxLength = AI_PROMPT_MAX_LENGTH,
  label,
  disabled,
  testID = 'ai-prompt-input',
}: AiPromptInputProps) {
  const { t } = useTranslation('ai');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label ?? t('promptLabel')} <Text style={styles.optional}>{t('optional')}</Text>
      </Text>
      <TextInput
        style={styles.input}
        multiline
        value={value}
        onChangeText={(text) => onChange(text.slice(0, maxLength))}
        maxLength={maxLength}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        testID={testID}
      />
      <Text style={styles.counter} testID={`${testID}-counter`}>
        {value.length}/{maxLength}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { fontSize: 13, fontWeight: '700', color: colors.text },
    optional: { fontWeight: '400', color: colors.textFaint },
    input: {
      minHeight: 84,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
      textAlignVertical: 'top',
    },
    counter: { fontSize: 12, color: colors.textFaint, textAlign: 'right' },
  });
}
