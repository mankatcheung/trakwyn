import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useCreateEducation,
  useCreateSkill,
  useCreateWorkExperience,
  useDeleteEducation,
  useDeleteSkill,
  useDeleteWorkExperience,
  useEducations,
  useSkills,
  useUpdateEducation,
  useUpdateWorkExperience,
  useWorkExperiences,
} from '../hooks/useExperience';
import { getErrorMessage } from '../../../lib/errors';
import type { Education, Skill, WorkExperience } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import i18n from '../../../i18n';
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../../applications/components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';

function dateRange(start: string, end: string | null): string {
  return `${start.slice(0, 10)} – ${end ? end.slice(0, 10) : i18n.t('settings:experience.present')}`;
}

export function ExperienceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <WorkExperienceSection />
      <EducationSection />
      <SkillsSection />
    </ScrollView>
  );
}

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
  const styles = useMemo(() => createStyles(colors), [colors]);
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

function WorkExperienceSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: items = [], isLoading } = useWorkExperiences();
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
          testID="add-work-experience-button"
          accessibilityLabel={t('experience.add')}
        />
      </View>

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
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EducationSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: items = [], isLoading } = useEducations();
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
          testID="add-education-button"
          accessibilityLabel={t('experience.add')}
        />
      </View>

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

interface SkillFormModalProps {
  visible: boolean;
  isSaving: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

function SkillFormModal({ visible, isSaving, onSave, onClose }: SkillFormModalProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="skill-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} testID="cancel-skill-button">
            <Text style={styles.linkMuted}>{t('experience.cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{t('experience.add')}</Text>
          <IconButton
            icon={CheckIcon}
            onPress={() => onSave(name.trim())}
            disabled={isSaving || !name.trim()}
            testID="save-skill-button"
            accessibilityLabel={t('experience.addSubmit')}
          />
        </View>
        <View style={styles.modalBody}>
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('experience.skillNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus
            testID="skill-name-input"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SkillsSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: skills = [], isLoading } = useSkills();
  const create = useCreateSkill();
  const remove = useDeleteSkill();

  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (name: string) => {
    if (!name) return;
    setError(null);
    try {
      await create.mutateAsync({ name });
      setIsAdding(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{t('experience.skillsTitle')}</Text>
        <IconButton
          icon={PlusIcon}
          onPress={() => setIsAdding(true)}
          testID="add-skill-button"
          accessibilityLabel={t('experience.add')}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        skills.length === 0 && <Text style={styles.emptyText}>{t('experience.noSkillsYet')}</Text>
      )}

      {skills.length > 0 && (
        <View style={styles.skillsWrap}>
          {skills.map((skill: Skill) => (
            <View key={skill.id} style={styles.skillChip} testID={`skill-${skill.id}`}>
              <Text style={styles.skillText}>{skill.name}</Text>
              <IconButton
                icon={TrashIcon}
                variant="danger"
                size={24}
                iconSize={12}
                onPress={() => remove.mutate(skill.id)}
                testID={`delete-skill-${skill.id}`}
                accessibilityLabel={t('experience.delete')}
              />
            </View>
          ))}
        </View>
      )}

      <SkillFormModal
        key={isAdding ? 'add' : 'closed'}
        visible={isAdding}
        isSaving={create.isPending}
        onSave={onSave}
        onClose={() => setIsAdding(false)}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 15, fontWeight: '700', color: colors.text },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    emptyText: { fontSize: 13, color: colors.textFaint },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.surfaceAlt,
      paddingTop: 10,
      gap: 8,
    },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 11, color: colors.textFaint },
    rowActions: { flexDirection: 'row', gap: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    skillChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 4,
      paddingVertical: 4,
      paddingLeft: 12,
    },
    skillText: { fontSize: 13, color: colors.text },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    modalBody: { padding: 16, gap: 10 },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
  });
}
