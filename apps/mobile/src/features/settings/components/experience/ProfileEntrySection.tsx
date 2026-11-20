import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingScreen } from '../../../../components/KeyboardAvoidingScreen';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../../../lib/errors';
import { useTheme } from '../../../../theme/ThemeContext';
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../../applications/components/ApplicationIcons';
import { IconButton } from '../../../../components/IconButton';
import { createExperienceStyles } from './experienceStyles';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface EntryField {
  key: string;
  placeholder: string;
  required?: boolean;
  /** A date is typed as YYYY-MM-DD, as the work experience dates are. */
  date?: boolean;
  multiline?: boolean;
  url?: boolean;
}

export type EntryValues = Record<string, string>;

/** The text a field is edited as: the stored value, with a date cut to the day. */
export function initialValues(
  fields: readonly EntryField[],
  item: Record<string, unknown> | null,
): EntryValues {
  return Object.fromEntries(
    fields.map((f) => {
      const raw = item?.[f.key];
      const text = typeof raw === 'string' ? raw : '';
      return [f.key, f.date ? text.slice(0, 10) : text];
    }),
  );
}

/**
 * What a save sends. A blank optional field is left out on create and sent as
 * null on update, so clearing it on the phone clears it on web too.
 */
export function entryInput<Input>(
  fields: readonly EntryField[],
  values: EntryValues,
  isUpdate: boolean,
): Input {
  const entries = fields.map((f) => {
    const text = (values[f.key] ?? '').trim();
    return [f.key, text || (isUpdate && !f.required ? null : undefined)] as const;
  });
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as Input;
}

function isFilled(fields: readonly EntryField[], values: EntryValues): boolean {
  return fields.every((f) => !f.required || (values[f.key] ?? '').trim() !== '');
}

function hasInvalidDate(fields: readonly EntryField[], values: EntryValues): boolean {
  return fields.some((f) => {
    const text = (values[f.key] ?? '').trim();
    return f.date && text !== '' && !DATE_PATTERN.test(text);
  });
}

interface EntryFormModalProps {
  testIdPrefix: string;
  fields: readonly EntryField[];
  editing: Record<string, unknown> | null;
  isSaving: boolean;
  /** A failed save, shown here because the sheet covers the section behind it. */
  error: string | null;
  onSave: (values: EntryValues) => void;
  onClose: () => void;
}

function EntryFormModal({
  testIdPrefix,
  fields,
  editing,
  isSaving,
  error,
  onSave,
  onClose,
}: EntryFormModalProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const [values, setValues] = useState(() => initialValues(fields, editing));
  const dateInvalid = hasInvalidDate(fields, values);
  const canSave = isFilled(fields, values) && !dateInvalid;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID={`${testIdPrefix}-form-modal`}
    >
      <KeyboardAvoidingScreen style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} testID={`cancel-${testIdPrefix}-button`}>
            <Text style={styles.linkMuted}>{t('experience.cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {editing ? t('experience.edit') : t('experience.add')}
          </Text>
          <IconButton
            icon={CheckIcon}
            onPress={() => onSave(values)}
            disabled={isSaving || !canSave}
            testID={`save-${testIdPrefix}-button`}
            accessibilityLabel={editing ? t('experience.update') : t('experience.addSubmit')}
          />
        </View>
        <View style={styles.modalBody}>
          {fields.map((f) => (
            <TextInput
              key={f.key}
              placeholderTextColor={colors.textFaint}
              style={[styles.input, f.multiline ? styles.inputMultiline : null]}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChangeText={(text) => setValues((prev) => ({ ...prev, [f.key]: text }))}
              multiline={f.multiline}
              autoCapitalize={f.url || f.date ? 'none' : 'sentences'}
              autoCorrect={!f.url && !f.date}
              keyboardType={f.url ? 'url' : 'default'}
              testID={`${testIdPrefix}-${f.key}-input`}
            />
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {dateInvalid ? (
            <Text style={styles.error} testID={`${testIdPrefix}-date-error`}>
              {t('experience.invalidDate')}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}

interface Mutation<Variables> {
  mutateAsync: (variables: Variables) => Promise<unknown>;
  isPending: boolean;
}

interface ProfileEntrySectionProps<Item extends { id: string }, Input> {
  testIdPrefix: string;
  title: string;
  emptyText: string;
  fields: readonly EntryField[];
  items: readonly Item[];
  isLoading: boolean;
  create: Mutation<Input>;
  update: Mutation<{ id: string; input: Input }>;
  remove: { mutate: (id: string) => void };
  rowTitle: (item: Item) => string;
  rowMeta: (item: Item) => string;
}

/** One profile section: a list with add, edit and delete, and a form sheet driven by `fields`. */
export function ProfileEntrySection<Item extends { id: string }, Input>({
  testIdPrefix,
  title,
  emptyText,
  fields,
  items,
  isLoading,
  create,
  update,
  remove,
  rowTitle,
  rowMeta,
}: ProfileEntrySectionProps<Item, Input>) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeModal = () => {
    setIsAdding(false);
    setEditing(null);
  };

  const onSave = async (values: EntryValues) => {
    setError(null);
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          input: entryInput<Input>(fields, values, true),
        });
      } else {
        await create.mutateAsync(entryInput<Input>(fields, values, false));
      }
      closeModal();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card} testID={`${testIdPrefix}-section`}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{title}</Text>
        <IconButton
          icon={PlusIcon}
          onPress={() => setIsAdding(true)}
          testID={`add-${testIdPrefix}-button`}
          accessibilityLabel={t('experience.add')}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        items.length === 0 && <Text style={styles.emptyText}>{emptyText}</Text>
      )}

      {items.map((item) => {
        const meta = rowMeta(item);
        return (
          <View key={item.id} style={styles.row} testID={`${testIdPrefix}-${item.id}`}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{rowTitle(item)}</Text>
              {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
            </View>
            <View style={styles.rowActions}>
              <IconButton
                icon={PencilIcon}
                onPress={() => setEditing(item)}
                testID={`edit-${testIdPrefix}-${item.id}`}
                accessibilityLabel={t('experience.edit')}
              />
              <IconButton
                icon={TrashIcon}
                variant="danger"
                onPress={() => remove.mutate(item.id)}
                testID={`delete-${testIdPrefix}-${item.id}`}
                accessibilityLabel={t('experience.delete')}
              />
            </View>
          </View>
        );
      })}

      {isAdding || editing ? (
        <EntryFormModal
          key={editing?.id ?? 'add'}
          testIdPrefix={testIdPrefix}
          fields={fields}
          editing={editing as Record<string, unknown> | null}
          isSaving={create.isPending || update.isPending}
          error={error}
          onSave={onSave}
          onClose={closeModal}
        />
      ) : null}
    </View>
  );
}
