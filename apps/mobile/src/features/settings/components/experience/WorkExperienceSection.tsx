import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useCreateWorkExperience,
  useDeleteWorkExperience,
  useUpdateWorkExperience,
  useWorkExperiences,
} from '../../hooks/useExperience';
import type { WorkExperience } from '../../types';
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

interface WorkExperienceFormModalProps {
  visible: boolean;
  editing: WorkExperience | null;
  isSaving: boolean;
  onSave: (input: {
    company: string;
    title: string;
    startDate: string;
    endDate: string | undefined;
  }) => void;
  onClose: () => void;
}

function WorkExperienceFormModal({
  visible,
  editing,
  isSaving,
  onSave,
  onClose,
}: WorkExperienceFormModalProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const [company, setCompany] = useState(editing?.company ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(editing?.endDate?.slice(0, 10) ?? '');

  const canSave = company.trim() && title.trim() && startDate.trim();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="work-experience-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} testID="cancel-work-experience-button">
            <Text style={styles.linkMuted}>{t('experience.cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {editing ? t('experience.edit') : t('experience.add')}
          </Text>
          <IconButton
            icon={CheckIcon}
            onPress={() =>
              onSave({
                company: company.trim(),
                title: title.trim(),
                startDate,
                endDate: endDate || undefined,
              })
            }
            disabled={isSaving || !canSave}
            testID="save-work-experience-button"
            accessibilityLabel={editing ? t('experience.update') : t('experience.addSubmit')}
          />
        </View>
        <View style={styles.modalBody}>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.companyPlaceholder')}
            value={company}
            onChangeText={setCompany}
            testID="work-experience-company-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.titlePlaceholder')}
            value={title}
            onChangeText={setTitle}
            testID="work-experience-title-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.startDatePlaceholder')}
            value={startDate}
            onChangeText={setStartDate}
            testID="work-experience-start-input"
          />
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.endDatePlaceholder')}
            value={endDate}
            onChangeText={setEndDate}
            testID="work-experience-end-input"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function WorkExperienceSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const { data: items = [], isLoading } = useWorkExperiences();
  const workFull = useQuotaFull('workExperiences', items.length);
  const create = useCreateWorkExperience();
  const update = useUpdateWorkExperience();
  const remove = useDeleteWorkExperience();

  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isModalVisible = isAdding || editing !== null;

  const closeModal = () => {
    setIsAdding(false);
    setEditing(null);
  };

  const onSave = async (input: {
    company: string;
    title: string;
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
        <Text style={styles.title}>{t('experience.workExperienceTitle')}</Text>
        <IconButton
          icon={PlusIcon}
          onPress={() => setIsAdding(true)}
          disabled={workFull}
          testID="add-work-experience-button"
          accessibilityLabel={t('experience.add')}
        />
      </View>
      <QuotaHint resource="workExperiences" used={items.length} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        items.length === 0 && (
          <Text style={styles.emptyText}>{t('experience.noWorkExperienceYet')}</Text>
        )
      )}

      {items.map((item) => (
        <View key={item.id} style={styles.row} testID={`work-experience-${item.id}`}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              {t('experience.titleAtCompany', { title: item.title, company: item.company })}
            </Text>
            <Text style={styles.rowMeta}>{dateRange(item.startDate, item.endDate)}</Text>
          </View>
          <View style={styles.rowActions}>
            <IconButton
              icon={PencilIcon}
              onPress={() => setEditing(item)}
              testID={`edit-work-experience-${item.id}`}
              accessibilityLabel={t('experience.edit')}
            />
            <IconButton
              icon={TrashIcon}
              variant="danger"
              onPress={() => remove.mutate(item.id)}
              testID={`delete-work-experience-${item.id}`}
              accessibilityLabel={t('experience.delete')}
            />
          </View>
        </View>
      ))}

      <WorkExperienceFormModal
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
