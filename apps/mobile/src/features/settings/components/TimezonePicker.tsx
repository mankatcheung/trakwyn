import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

// Intl.supportedValuesOf isn't guaranteed on every Hermes build this app
// ships to, so this mirrors apps/web's own try/catch — falling back to a
// curated list of common IANA zones rather than leaving the picker empty.
const FALLBACK_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Pacific/Auckland',
  'Pacific/Honolulu',
];

function listTimezones(): string[] {
  try {
    const zones = Intl.supportedValuesOf?.('timeZone');
    if (zones && zones.length > 0) return zones;
  } catch {
    // Not supported on this runtime — use the fallback list below.
  }
  return FALLBACK_TIMEZONES;
}

interface TimezonePickerProps {
  value: string;
  onChange: (timezone: string) => void;
  testID?: string;
}

export function TimezonePicker({ value, onChange, testID }: TimezonePickerProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const zones = useMemo(() => listTimezones(), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return zones;
    return zones.filter((zone) => zone.toLowerCase().includes(needle));
  }, [zones, query]);

  const onSelect = (zone: string) => {
    onChange(zone);
    setQuery('');
    setOpen(false);
  };

  const onClose = () => {
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)} testID={testID}>
        <Text style={value ? styles.fieldValue : styles.fieldPlaceholder}>
          {value || t('profile.timezonePlaceholder')}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.timezoneModalTitle')}</Text>
              <Pressable onPress={onClose} testID="timezone-picker-done">
                <Text style={styles.doneText}>{t('profile.timezoneDone')}</Text>
              </Pressable>
            </View>
            <TextInput
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              placeholder={t('profile.timezoneSearchPlaceholder')}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoFocus
              testID="timezone-search-input"
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() => onSelect(item)}
                  testID={`timezone-option-${item}`}
                >
                  <Text style={[styles.rowText, item === value && styles.rowTextSelected]}>
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    field: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    fieldValue: { fontSize: 15, color: colors.text },
    fieldPlaceholder: { fontSize: 15, color: colors.textFaint },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    keyboardAvoidingContainer: { flex: 1 },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    doneText: { fontSize: 15, fontWeight: '600', color: colors.primary },
    searchInput: {
      margin: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowText: { fontSize: 15, color: colors.text },
    rowTextSelected: { color: colors.primary, fontWeight: '700' },
  });
}
