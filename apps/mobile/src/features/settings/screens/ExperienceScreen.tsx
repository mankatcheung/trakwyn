import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
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

function WorkExperienceSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: items = [], isLoading } = useWorkExperiences();
  const create = useCreateWorkExperience();
  const update = useUpdateWorkExperience();
  const remove = useDeleteWorkExperience();

  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setCompany('');
    setTitle('');
    setStartDate('');
    setEndDate('');
    setFormOpen(true);
  };

  const openEdit = (item: WorkExperience) => {
    setEditing(item);
    setCompany(item.company);
    setTitle(item.title);
    setStartDate(item.startDate.slice(0, 10));
    setEndDate(item.endDate?.slice(0, 10) ?? '');
    setFormOpen(true);
  };

  const onSave = async () => {
    if (!company.trim() || !title.trim() || !startDate.trim()) return;
    setError(null);
    const input = {
      company: company.trim(),
      title: title.trim(),
      startDate,
      endDate: endDate || undefined,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
      } else {
        await create.mutateAsync(input);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{t('experience.workExperienceTitle')}</Text>
        {!formOpen && (
          <Pressable onPress={openCreate} testID="add-work-experience-button">
            <Text style={styles.link}>{t('experience.add')}</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        !formOpen &&
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
            <Pressable onPress={() => openEdit(item)} testID={`edit-work-experience-${item.id}`}>
              <Text style={styles.link}>{t('experience.edit')}</Text>
            </Pressable>
            <Pressable
              onPress={() => remove.mutate(item.id)}
              testID={`delete-work-experience-${item.id}`}
            >
              <Text style={styles.linkDanger}>{t('experience.delete')}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {formOpen && (
        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={t('experience.companyPlaceholder')}
            value={company}
            onChangeText={setCompany}
            testID="work-experience-company-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('experience.titlePlaceholder')}
            value={title}
            onChangeText={setTitle}
            testID="work-experience-title-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('experience.startDatePlaceholder')}
            value={startDate}
            onChangeText={setStartDate}
            testID="work-experience-start-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('experience.endDatePlaceholder')}
            value={endDate}
            onChangeText={setEndDate}
            testID="work-experience-end-input"
          />
          <View style={styles.formActions}>
            <Pressable
              style={styles.button}
              onPress={onSave}
              disabled={create.isPending || update.isPending}
              testID="save-work-experience-button"
            >
              <Text style={styles.buttonText}>
                {editing ? t('experience.update') : t('experience.addSubmit')}
              </Text>
            </Pressable>
            <Pressable onPress={() => setFormOpen(false)} testID="cancel-work-experience-button">
              <Text style={styles.link}>{t('experience.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
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
  const [formOpen, setFormOpen] = useState(false);
  const [institution, setInstitution] = useState('');
  const [degree, setDegree] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setInstitution('');
    setDegree('');
    setStartDate('');
    setEndDate('');
    setFormOpen(true);
  };

  const openEdit = (item: Education) => {
    setEditing(item);
    setInstitution(item.institution);
    setDegree(item.degree ?? '');
    setStartDate(item.startDate.slice(0, 10));
    setEndDate(item.endDate?.slice(0, 10) ?? '');
    setFormOpen(true);
  };

  const onSave = async () => {
    if (!institution.trim() || !startDate.trim()) return;
    setError(null);
    const input = {
      institution: institution.trim(),
      degree: degree.trim() || undefined,
      startDate,
      endDate: endDate || undefined,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
      } else {
        await create.mutateAsync(input);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{t('experience.educationTitle')}</Text>
        {!formOpen && (
          <Pressable onPress={openCreate} testID="add-education-button">
            <Text style={styles.link}>{t('experience.add')}</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        !formOpen &&
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
            <Pressable onPress={() => openEdit(item)} testID={`edit-education-${item.id}`}>
              <Text style={styles.link}>{t('experience.edit')}</Text>
            </Pressable>
            <Pressable
              onPress={() => remove.mutate(item.id)}
              testID={`delete-education-${item.id}`}
            >
              <Text style={styles.linkDanger}>{t('experience.delete')}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {formOpen && (
        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={t('experience.institutionPlaceholder')}
            value={institution}
            onChangeText={setInstitution}
            testID="education-institution-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('experience.degreePlaceholder')}
            value={degree}
            onChangeText={setDegree}
            testID="education-degree-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('experience.startDatePlaceholder')}
            value={startDate}
            onChangeText={setStartDate}
            testID="education-start-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('experience.endDatePlaceholder')}
            value={endDate}
            onChangeText={setEndDate}
            testID="education-end-input"
          />
          <View style={styles.formActions}>
            <Pressable
              style={styles.button}
              onPress={onSave}
              disabled={create.isPending || update.isPending}
              testID="save-education-button"
            >
              <Text style={styles.buttonText}>
                {editing ? t('experience.update') : t('experience.addSubmit')}
              </Text>
            </Pressable>
            <Pressable onPress={() => setFormOpen(false)} testID="cancel-education-button">
              <Text style={styles.link}>{t('experience.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function SkillsSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: skills = [], isLoading } = useSkills();
  const create = useCreateSkill();
  const remove = useDeleteSkill();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim() });
      setName('');
      setFormOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.title}>{t('experience.skillsTitle')}</Text>
        {!formOpen && (
          <Pressable onPress={() => setFormOpen(true)} testID="add-skill-button">
            <Text style={styles.link}>{t('experience.add')}</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        !formOpen &&
        skills.length === 0 && <Text style={styles.emptyText}>{t('experience.noSkillsYet')}</Text>
      )}

      {skills.length > 0 && (
        <View style={styles.skillsWrap}>
          {skills.map((skill: Skill) => (
            <View key={skill.id} style={styles.skillChip} testID={`skill-${skill.id}`}>
              <Text style={styles.skillText}>{skill.name}</Text>
              <Pressable
                onPress={() => remove.mutate(skill.id)}
                testID={`delete-skill-${skill.id}`}
              >
                <Text style={styles.skillDelete}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {formOpen && (
        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={t('experience.skillNamePlaceholder')}
            value={name}
            onChangeText={setName}
            testID="skill-name-input"
          />
          <View style={styles.formActions}>
            <Pressable
              style={styles.button}
              onPress={onSave}
              disabled={create.isPending}
              testID="save-skill-button"
            >
              <Text style={styles.buttonText}>{t('experience.addSubmit')}</Text>
            </Pressable>
            <Pressable onPress={() => setFormOpen(false)} testID="cancel-skill-button">
              <Text style={styles.link}>{t('experience.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}
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
    rowActions: { flexDirection: 'row', gap: 12 },
    form: { gap: 8, borderTopWidth: 1, borderTopColor: colors.surfaceAlt, paddingTop: 10 },
    formActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    button: {
      alignSelf: 'flex-start',
      minHeight: 40,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
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
      gap: 6,
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    skillText: { fontSize: 13, color: colors.text },
    skillDelete: { fontSize: 14, color: colors.textFaint, fontWeight: '700' },
  });
}
