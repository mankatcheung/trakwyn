import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingScreen } from '../../../../components/KeyboardAvoidingScreen';
import { useTranslation } from 'react-i18next';
import {
  useCreateEducation,
  useDeleteEducation,
  useEducations,
  useUpdateEducation,
} from '../../hooks/useExperience';
import type { Education } from '../../types';
import { getErrorMessage } from '../../../../lib/errors';
import { QuotaHint } from '../../../quota/components/QuotaHint';
import { useQuotaFull } from '../../../quota/hooks/useQuotaState';
import { useTheme } from '../../../../theme/ThemeContext';
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../../applications/components/ApplicationIcons';
import { IconButton } from '../../../../components/IconButton';
import { createExperienceStyles } from './experienceStyles';
import { dateRange } from './dateRange';

interface EducationFormModalProps {
  visible: boolean;
  editing: Education | null;
  isSaving: boolean;
  onSave: (input: {
    institution: string;
    degree: string | undefined;
    startDate: string;
    endDate: string | undefined;
  }) => void;
  onClose: () => void;
}

function EducationFormModal({
  visible,
  editing,
  isSaving,
  onSave,
  onClose,
}: EducationFormModalProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const [institution, setInstitution] = useState(editing?.institution ?? '');
  const [degree, setDegree] = useState(editing?.degree ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(editing?.endDate?.slice(0, 10) ?? '');

  const canSave = institution.trim() && startDate.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="education-form-modal"
    >
      <KeyboardAvoidingScreen style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} testID="cancel-education-button">
            <Text style={styles.linkMuted}>{t('experience.cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {editing ? t('experience.edit') : t('experience.add')}
          </Text>
          <IconButton
            icon={CheckIcon}
            onPress={() =>
              onSave({
                institution: institution.trim(),
                degree: degree.trim() || undefined,
                startDate,
                endDate: endDate || undefined,
              })
            }
            disabled={isSaving || !canSave}
            testID="save-education-button"
            accessibilityLabel={editing ? t('experience.update') : t('experience.addSubmit')}
          />
        </View>
        <View style={styles.modalBody}>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.institutionPlaceholder')}
            value={institution}
            onChangeText={setInstitution}
            testID="education-institution-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.degreePlaceholder')}
            value={degree}
            onChangeText={setDegree}
            testID="education-degree-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.startDatePlaceholder')}
            value={startDate}
            onChangeText={setStartDate}
            testID="education-start-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.endDatePlaceholder')}
            value={endDate}
            onChangeText={setEndDate}
            testID="education-end-input"
          />
        </View>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}

export function EducationSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const { data: items = [], isLoading } = useEducations();
  const educationFull = useQuotaFull('educations', items.length);
  const create = useCreateEducation();
  const update = useUpdateEducation();
  const remove = useDeleteEducation();

  const [editing, setEditing] = useState<Education | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isModalVisible = isAdding || editing !== null;

  const closeModal = () => {
    setIsAdding(false);
    setEditing(null);
  };

  const onSave = async (input: {
    institution: string;
    degree: string | undefined;
    startDate: string;
    endDate: string | undefined;
  }) => {
    setError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
      } else {
        await create.mutateAsync(input);
      }
      closeModal();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{t('experience.educationTitle')}</Text>
        <IconButton
          icon={PlusIcon}
          onPress={() => setIsAdding(true)}
          disabled={educationFull}
          testID="add-education-button"
          accessibilityLabel={t('experience.add')}
        />
      </View>
      <QuotaHint resource="educations" used={items.length} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        items.length === 0 && <Text style={styles.emptyText}>{t('experience.noEducationYet')}</Text>
      )}

      {items.map((item) => (
        <View key={item.id} style={styles.row} testID={`education-${item.id}`}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              {item.institution}
              {item.degree ? t('experience.institutionDegree', { degree: item.degree }) : ''}
            </Text>
            <Text style={styles.rowMeta}>{dateRange(item.startDate, item.endDate)}</Text>
          </View>
          <View style={styles.rowActions}>
            <IconButton
              icon={PencilIcon}
              onPress={() => setEditing(item)}
              testID={`edit-education-${item.id}`}
              accessibilityLabel={t('experience.edit')}
            />
            <IconButton
              icon={TrashIcon}
              variant="danger"
              onPress={() => remove.mutate(item.id)}
              testID={`delete-education-${item.id}`}
              accessibilityLabel={t('experience.delete')}
            />
          </View>
        </View>
      ))}

      <EducationFormModal
        key={editing?.id ?? (isAdding ? 'add' : 'closed')}
        visible={isModalVisible}
        editing={editing}
        isSaving={create.isPending || update.isPending}
        onSave={onSave}
        onClose={closeModal}
      />
    </View>
  );
}
