import React, { useMemo } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LLM_PROVIDER_LABEL, type LlmApiKey } from '../../settings/types';
import { useTheme } from '../../../theme/ThemeContext';
import { createSheetStyles } from '../../../components/sheetStyles';

interface ConversationProviderPickerProps {
  keys: LlmApiKey[];
  defaultProvider: string | null;
  onSelect: (key: LlmApiKey) => void;
  onClose: () => void;
}

/** Bottom sheet for picking which saved LLM API key a new conversation
 * should use — extracted from AiSettingsScreen's ProviderPicker sheet
 * pattern (JEF-311). Highlights the account's default provider so it can
 * be confirmed with a single tap, but every saved key is offered. */
export function ConversationProviderPicker({
  keys,
  defaultProvider,
  onSelect,
  onClose,
}: ConversationProviderPickerProps) {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const styles = useMemo(() => createSheetStyles(colors), [colors]);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={styles.sheetBackdrop}
        onPress={onClose}
        testID="conversation-provider-picker-backdrop"
      />
      <View style={styles.sheetContainer}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('conversations.pickerTitle')}</Text>
          {keys.map((key) => {
            const isDefault = key.provider === defaultProvider;
            return (
              <Pressable
                key={key.provider}
                style={styles.sheetRow}
                onPress={() => onSelect(key)}
                testID={`conversation-provider-option-${key.provider}`}
              >
                <Text style={[styles.sheetRowText, isDefault && styles.sheetRowTextSelected]}>
                  {LLM_PROVIDER_LABEL[key.provider] ?? key.provider}
                  {isDefault ? ` · ${t('conversations.pickerDefault')}` : ''}
                </Text>
                {key.model ? <Text style={styles.sheetRowMeta}>{key.model}</Text> : null}
              </Pressable>
            );
          })}
          <Pressable
            style={styles.sheetCancel}
            onPress={onClose}
            testID="conversation-provider-picker-cancel"
          >
            <Text style={styles.sheetCancelText}>{t('conversations.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
