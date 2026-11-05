import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  TRAKWYN_ENTRY,
  addEntry,
  moveEntry,
  providerEntryLabel,
  removeEntry,
  unlistedEntries,
} from '../lib/aiProviderOrder';
import type { LlmApiKey } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

interface AiProviderOrderCardProps {
  /** The providers that can answer, in the order they are tried. */
  order: string[];
  keys: LlmApiKey[];
  /** Whether the plan includes Trakwyn AI. */
  hostedAi: boolean;
  /** A save is in flight. */
  pending: boolean;
  error: string | null;
  onChange: (order: string[]) => void;
}

/**
 * The one place a user says which AI answers (JEF-503): an ordered list, tried from the
 * top. If a provider fails, hits its limit or runs out of credits the next one takes
 * over, and nothing that is not in the list is ever used. It replaces the AI source
 * picker, the "make default" action and the fall-through switch.
 */
export function AiProviderOrderCard({
  order,
  keys,
  hostedAi,
  pending,
  error,
  onChange,
}: AiProviderOrderCardProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const unlisted = unlistedEntries(order, keys, hostedAi);

  return (
    <View style={styles.card} testID="ai-order-card">
      <Text style={styles.title}>{t('ai.order.title')}</Text>
      <Text style={styles.help}>{t('ai.order.help')}</Text>

      {order.length === 0 ? (
        <Text style={styles.help} testID="ai-order-empty">
          {t('ai.order.empty')}
        </Text>
      ) : (
        <View style={styles.list}>
          {order.map((entry, index) => {
            const name = providerEntryLabel(entry);
            const first = index === 0;
            const last = index === order.length - 1;
            return (
              <View key={entry} style={styles.row} testID={`ai-order-${entry}`}>
                <Text style={styles.position}>{index + 1}</Text>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{name}</Text>
                  <Text style={styles.note}>
                    {entry === TRAKWYN_ENTRY
                      ? t('ai.order.trakwynNote')
                      : t('ai.order.keyNote', { provider: name })}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.action, (pending || first) && styles.actionDisabled]}
                    disabled={pending || first}
                    onPress={() => onChange(moveEntry(order, index, -1))}
                    accessibilityLabel={t('ai.order.moveUp', { name })}
                    testID={`ai-order-up-${entry}`}
                    hitSlop={6}
                  >
                    <Text style={styles.actionText}>↑</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.action, (pending || last) && styles.actionDisabled]}
                    disabled={pending || last}
                    onPress={() => onChange(moveEntry(order, index, 1))}
                    accessibilityLabel={t('ai.order.moveDown', { name })}
                    testID={`ai-order-down-${entry}`}
                    hitSlop={6}
                  >
                    <Text style={styles.actionText}>↓</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.action,
                      (pending || order.length === 1) && styles.actionDisabled,
                    ]}
                    disabled={pending || order.length === 1}
                    onPress={() => onChange(removeEntry(order, entry))}
                    accessibilityLabel={t('ai.order.remove', { name })}
                    testID={`ai-order-remove-${entry}`}
                    hitSlop={6}
                  >
                    <Text style={[styles.actionText, styles.actionDanger]}>✕</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {order.length === 1 && unlisted.length > 0 ? (
        <Text style={styles.help} testID="ai-order-only-one">
          {t('ai.order.onlyOne')}
        </Text>
      ) : null}

      {unlisted.length > 0 ? (
        <View style={styles.unlisted}>
          <Text style={styles.subtitle}>{t('ai.order.addTitle')}</Text>
          <View style={styles.addRow}>
            {unlisted.map((entry) => {
              const name = providerEntryLabel(entry);
              return (
                <Pressable
                  key={entry}
                  style={[styles.addButton, pending && styles.actionDisabled]}
                  disabled={pending}
                  onPress={() => onChange(addEntry(order, entry))}
                  testID={`ai-order-add-${entry}`}
                >
                  <Text style={styles.addButtonText}>{t('ai.order.add', { name })}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
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
      padding: 14,
      gap: 10,
    },
    title: { fontSize: 16, fontWeight: '600', color: colors.text },
    subtitle: { fontSize: 12, fontWeight: '600', color: colors.textSubtle },
    help: { fontSize: 13, color: colors.textSubtle },
    list: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    position: { width: 14, fontSize: 14, color: colors.textSubtle },
    rowText: { flex: 1, gap: 2 },
    name: { fontSize: 14, fontWeight: '600', color: colors.text },
    note: { fontSize: 12, color: colors.textSubtle },
    actions: { flexDirection: 'row', gap: 4 },
    action: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionDisabled: { opacity: 0.3 },
    actionText: { fontSize: 18, color: colors.text },
    actionDanger: { color: colors.danger },
    unlisted: { gap: 6 },
    addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    addButton: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    addButtonText: { fontSize: 14, color: colors.text },
    error: { fontSize: 13, color: colors.danger },
  });
}
