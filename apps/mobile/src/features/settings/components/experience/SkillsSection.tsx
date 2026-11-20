import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingScreen } from '../../../../components/KeyboardAvoidingScreen';
import { useTranslation } from 'react-i18next';
import { useCreateSkill, useDeleteSkill, useSkills } from '../../hooks/useExperience';
import type { Skill } from '../../types';
import { getErrorMessage } from '../../../../lib/errors';
import { QuotaHint } from '../../../quota/components/QuotaHint';
import { useQuotaFull } from '../../../quota/hooks/useQuotaState';
import { useTheme } from '../../../../theme/ThemeContext';
import { CheckIcon, PlusIcon, TrashIcon } from '../../../applications/components/ApplicationIcons';
import { IconButton } from '../../../../components/IconButton';
import { createExperienceStyles } from './experienceStyles';

interface SkillFormModalProps {
  visible: boolean;
  isSaving: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

function SkillFormModal({ visible, isSaving, onSave, onClose }: SkillFormModalProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const [name, setName] = useState('');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="skill-form-modal"
    >
      <KeyboardAvoidingScreen style={styles.modalContainer}>
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
      </KeyboardAvoidingScreen>
    </Modal>
  );
}

export function SkillsSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createExperienceStyles(colors), [colors]);
  const { data: skills = [], isLoading } = useSkills();
  const skillsFull = useQuotaFull('skills', skills.length);
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
          disabled={skillsFull}
          testID="add-skill-button"
          accessibilityLabel={t('experience.add')}
        />
      </View>
      <QuotaHint resource="skills" used={skills.length} />

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
