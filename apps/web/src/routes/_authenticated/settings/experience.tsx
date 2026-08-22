import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  BriefcaseIcon,
  GraduationCapIcon,
  WrenchIcon,
} from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { useLocale } from '#/lib/i18n';
import {
  Alert,
  Button,
  FormLabel,
  IconButton,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@trakwyn/ui';

export const Route = createFileRoute('/_authenticated/settings/experience')({
  component: SettingsExperiencePage,
});

// ── Queries ──────────────────────────────────────────────────────────────

const WORK_EXPERIENCES_QUERY = `
  query WorkExperiences {
    workExperiences {
      id
      company
      title
      location
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const EDUCATIONS_QUERY = `
  query Educations {
    educations {
      id
      institution
      degree
      field
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const SKILLS_QUERY = `
  query Skills {
    skills {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`;

// ── Mutations ────────────────────────────────────────────────────────────

const CREATE_WORK_EXPERIENCE = `
  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {
    createWorkExperience(input: $input) {
      id
      company
      title
      location
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_WORK_EXPERIENCE = `
  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {
    updateWorkExperience(id: $id, input: $input) {
      id
      company
      title
      location
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const DELETE_WORK_EXPERIENCE = `
  mutation DeleteWorkExperience($id: ID!) {
    deleteWorkExperience(id: $id)
  }
`;

const CREATE_EDUCATION = `
  mutation CreateEducation($input: CreateEducationInput!) {
    createEducation(input: $input) {
      id
      institution
      degree
      field
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_EDUCATION = `
  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {
    updateEducation(id: $id, input: $input) {
      id
      institution
      degree
      field
      startDate
      endDate
      description
      createdAt
      updatedAt
    }
  }
`;

const DELETE_EDUCATION = `
  mutation DeleteEducation($id: ID!) {
    deleteEducation(id: $id)
  }
`;

const CREATE_SKILL = `
  mutation CreateSkill($input: CreateSkillInput!) {
    createSkill(input: $input) {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`;

const UPDATE_SKILL = `
  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {
    updateSkill(id: $id, input: $input) {
      id
      name
      category
      proficiency
      createdAt
    }
  }
`;

const DELETE_SKILL = `
  mutation DeleteSkill($id: ID!) {
    deleteSkill(id: $id)
  }
`;

// ── Schemas ──────────────────────────────────────────────────────────────

const workExperienceSchema = z.object({
  company: z.string().min(1, 'Required'),
  title: z.string().min(1, 'Required'),
  location: z.string().optional(),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

const educationSchema = z.object({
  institution: z.string().min(1, 'Required'),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

const skillSchema = z.object({
  name: z.string().min(1, 'Required'),
  category: z.string().optional(),
  proficiency: z.string().optional(),
});

type WorkExperienceForm = z.infer<typeof workExperienceSchema>;
type EducationForm = z.infer<typeof educationSchema>;
type SkillForm = z.infer<typeof skillSchema>;

// ── Types ────────────────────────────────────────────────────────────────

type WorkExperience = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type Education = {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type Skill = {
  id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
  createdAt: string;
};

// ── Component ────────────────────────────────────────────────────────────

function SettingsExperiencePage() {
  const { t } = useLocale();
  const qc = useQueryClient();

  // Queries
  const { data: weData, isLoading: weLoading } = useQuery({
    queryKey: ['workExperiences'],
    queryFn: () => gqlClient.request<{ workExperiences: WorkExperience[] }>(WORK_EXPERIENCES_QUERY),
  });
  const { data: eduData, isLoading: eduLoading } = useQuery({
    queryKey: ['educations'],
    queryFn: () => gqlClient.request<{ educations: Education[] }>(EDUCATIONS_QUERY),
  });
  const { data: skillData, isLoading: skillLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: () => gqlClient.request<{ skills: Skill[] }>(SKILLS_QUERY),
  });

  const workExperiences = weData?.workExperiences ?? [];
  const educations = eduData?.educations ?? [];
  const skills = skillData?.skills ?? [];

  // ── Work Experience ──
  const [weEditing, setWeEditing] = useState<WorkExperience | null>(null);
  const [weFormOpen, setWeFormOpen] = useState(false);
  const weForm = useForm<WorkExperienceForm>({
    resolver: zodResolver(workExperienceSchema),
    values: weEditing
      ? {
          company: weEditing.company,
          title: weEditing.title,
          location: weEditing.location ?? '',
          startDate: weEditing.startDate.slice(0, 10),
          endDate: weEditing.endDate?.slice(0, 10) ?? '',
          description: weEditing.description ?? '',
        }
      : { company: '', title: '', location: '', startDate: '', endDate: '', description: '' },
  });

  const createWe = useMutation({
    mutationFn: (data: WorkExperienceForm) =>
      gqlClient.request(CREATE_WORK_EXPERIENCE, {
        input: {
          ...data,
          location: data.location || undefined,
          endDate: data.endDate || undefined,
          description: data.description || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workExperiences'] });
      setWeFormOpen(false);
      weForm.reset();
    },
  });

  const updateWe = useMutation({
    mutationFn: (data: WorkExperienceForm) =>
      gqlClient.request(UPDATE_WORK_EXPERIENCE, {
        id: weEditing!.id,
        input: {
          ...data,
          location: data.location || undefined,
          endDate: data.endDate || undefined,
          description: data.description || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workExperiences'] });
      setWeFormOpen(false);
      setWeEditing(null);
      weForm.reset();
    },
  });

  const deleteWe = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_WORK_EXPERIENCE, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workExperiences'] }),
  });

  // ── Education ──
  const [eduEditing, setEduEditing] = useState<Education | null>(null);
  const [eduFormOpen, setEduFormOpen] = useState(false);
  const eduForm = useForm<EducationForm>({
    resolver: zodResolver(educationSchema),
    values: eduEditing
      ? {
          institution: eduEditing.institution,
          degree: eduEditing.degree ?? '',
          field: eduEditing.field ?? '',
          startDate: eduEditing.startDate.slice(0, 10),
          endDate: eduEditing.endDate?.slice(0, 10) ?? '',
          description: eduEditing.description ?? '',
        }
      : { institution: '', degree: '', field: '', startDate: '', endDate: '', description: '' },
  });

  const createEdu = useMutation({
    mutationFn: (data: EducationForm) =>
      gqlClient.request(CREATE_EDUCATION, {
        input: {
          ...data,
          degree: data.degree || undefined,
          field: data.field || undefined,
          endDate: data.endDate || undefined,
          description: data.description || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educations'] });
      setEduFormOpen(false);
      eduForm.reset();
    },
  });

  const updateEdu = useMutation({
    mutationFn: (data: EducationForm) =>
      gqlClient.request(UPDATE_EDUCATION, {
        id: eduEditing!.id,
        input: {
          ...data,
          degree: data.degree || undefined,
          field: data.field || undefined,
          endDate: data.endDate || undefined,
          description: data.description || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['educations'] });
      setEduFormOpen(false);
      setEduEditing(null);
      eduForm.reset();
    },
  });

  const deleteEdu = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_EDUCATION, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['educations'] }),
  });

  // ── Skills ──
  const [skillEditing, setSkillEditing] = useState<Skill | null>(null);
  const [skillFormOpen, setSkillFormOpen] = useState(false);
  const skillForm = useForm<SkillForm>({
    resolver: zodResolver(skillSchema),
    values: skillEditing
      ? {
          name: skillEditing.name,
          category: skillEditing.category ?? '',
          proficiency: skillEditing.proficiency ?? '',
        }
      : { name: '', category: '', proficiency: '' },
  });

  const createSkill = useMutation({
    mutationFn: (data: SkillForm) =>
      gqlClient.request(CREATE_SKILL, {
        input: {
          ...data,
          category: data.category || undefined,
          proficiency: data.proficiency || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      setSkillFormOpen(false);
      skillForm.reset();
    },
  });

  const updateSkill = useMutation({
    mutationFn: (data: SkillForm) =>
      gqlClient.request(UPDATE_SKILL, {
        id: skillEditing!.id,
        input: {
          ...data,
          category: data.category || undefined,
          proficiency: data.proficiency || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      setSkillFormOpen(false);
      setSkillEditing(null);
      skillForm.reset();
    },
  });

  const deleteSkill = useMutation({
    mutationFn: (id: string) => gqlClient.request(DELETE_SKILL, { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  });

  return (
    <div className="space-y-10">
      {/* ── Work Experience ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <BriefcaseIcon size={18} /> {t('experience.workExperienceTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('experience.workExperienceDescription')}
            </p>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setWeEditing(null);
              setWeFormOpen(true);
            }}
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} /> <span className="hidden sm:inline">{t('common.add')}</span>
            </span>
          </Button>
        </div>

        {weLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          workExperiences.length === 0 &&
          !weFormOpen && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('experience.noWorkExperiencesYet')}
            </p>
          )
        )}

        {workExperiences.map((we) => (
          <div
            key={we.id}
            className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t('experience.titleAtCompany', { title: we.title, company: we.company })}
              </p>
              {we.location && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{we.location}</p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {we.startDate.slice(0, 10)} –{' '}
                {we.endDate ? we.endDate.slice(0, 10) : t('experience.present')}
              </p>
              {we.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {we.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconButton
                label={t('common.edit')}
                icon={<PencilIcon size={14} />}
                onClick={() => {
                  setWeEditing(we);
                  setWeFormOpen(true);
                }}
              />
              <IconButton
                label={t('common.delete')}
                icon={<Trash2Icon size={14} />}
                variant="danger"
                onClick={() => deleteWe.mutate(we.id)}
              />
            </div>
          </div>
        ))}

        {weFormOpen && (
          <form
            onSubmit={weForm.handleSubmit((data) =>
              weEditing ? updateWe.mutate(data) : createWe.mutate(data),
            )}
            className="space-y-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('experience.companyLabel')}</FormLabel>
                <Input
                  {...weForm.register('company')}
                  invalid={!!weForm.formState.errors.company}
                  placeholder="Acme Corp"
                />
                {weForm.formState.errors.company && (
                  <p className="mt-1 text-xs text-red-600">
                    {weForm.formState.errors.company.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel>{t('experience.titleLabel')}</FormLabel>
                <Input
                  {...weForm.register('title')}
                  invalid={!!weForm.formState.errors.title}
                  placeholder="Software Engineer"
                />
                {weForm.formState.errors.title && (
                  <p className="mt-1 text-xs text-red-600">
                    {weForm.formState.errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel>{t('experience.locationLabel')}</FormLabel>
                <Input {...weForm.register('location')} placeholder="San Francisco, CA" />
              </div>
              <div>
                <FormLabel>{t('experience.startDateLabel')}</FormLabel>
                <Input
                  type="date"
                  {...weForm.register('startDate')}
                  invalid={!!weForm.formState.errors.startDate}
                />
                {weForm.formState.errors.startDate && (
                  <p className="mt-1 text-xs text-red-600">
                    {weForm.formState.errors.startDate.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel>{t('experience.endDateLabel')}</FormLabel>
                <Input type="date" {...weForm.register('endDate')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('experience.descriptionLabel')}</FormLabel>
              <Textarea
                {...weForm.register('description')}
                rows={3}
                placeholder={t('experience.workDescriptionPlaceholder')}
              />
            </div>
            {weForm.formState.errors.root?.message && (
              <Alert>{weForm.formState.errors.root.message}</Alert>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={weForm.formState.isSubmitting}>
                {weForm.formState.isSubmitting
                  ? t('applicationForm.saving')
                  : weEditing
                    ? t('experience.update')
                    : t('common.add')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setWeFormOpen(false);
                  setWeEditing(null);
                  weForm.reset();
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Education ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <GraduationCapIcon size={18} /> {t('experience.educationTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('experience.educationDescription')}
            </p>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setEduEditing(null);
              setEduFormOpen(true);
            }}
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} /> <span className="hidden sm:inline">{t('common.add')}</span>
            </span>
          </Button>
        </div>

        {eduLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : (
          educations.length === 0 &&
          !eduFormOpen && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('experience.noEducationYet')}
            </p>
          )
        )}

        {educations.map((edu) => (
          <div
            key={edu.id}
            className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {edu.institution}
                {edu.degree && ` — ${edu.degree}`}
                {edu.field && ` ${t('experience.inField', { field: edu.field })}`}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {edu.startDate.slice(0, 10)} –{' '}
                {edu.endDate ? edu.endDate.slice(0, 10) : t('experience.present')}
              </p>
              {edu.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {edu.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconButton
                label={t('common.edit')}
                icon={<PencilIcon size={14} />}
                onClick={() => {
                  setEduEditing(edu);
                  setEduFormOpen(true);
                }}
              />
              <IconButton
                label={t('common.delete')}
                icon={<Trash2Icon size={14} />}
                variant="danger"
                onClick={() => deleteEdu.mutate(edu.id)}
              />
            </div>
          </div>
        ))}

        {eduFormOpen && (
          <form
            onSubmit={eduForm.handleSubmit((data) =>
              eduEditing ? updateEdu.mutate(data) : createEdu.mutate(data),
            )}
            className="space-y-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FormLabel>{t('experience.institutionLabel')}</FormLabel>
                <Input
                  {...eduForm.register('institution')}
                  invalid={!!eduForm.formState.errors.institution}
                  placeholder="MIT"
                />
                {eduForm.formState.errors.institution && (
                  <p className="mt-1 text-xs text-red-600">
                    {eduForm.formState.errors.institution.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel>{t('experience.degreeLabel')}</FormLabel>
                <Input {...eduForm.register('degree')} placeholder="B.S." />
              </div>
              <div>
                <FormLabel>{t('experience.fieldLabel')}</FormLabel>
                <Input {...eduForm.register('field')} placeholder="Computer Science" />
              </div>
              <div>
                <FormLabel>{t('experience.startDateLabel')}</FormLabel>
                <Input
                  type="date"
                  {...eduForm.register('startDate')}
                  invalid={!!eduForm.formState.errors.startDate}
                />
                {eduForm.formState.errors.startDate && (
                  <p className="mt-1 text-xs text-red-600">
                    {eduForm.formState.errors.startDate.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel>{t('experience.endDateLabel')}</FormLabel>
                <Input type="date" {...eduForm.register('endDate')} />
              </div>
            </div>
            <div>
              <FormLabel>{t('experience.descriptionLabel')}</FormLabel>
              <Textarea
                {...eduForm.register('description')}
                rows={3}
                placeholder={t('experience.educationDescriptionPlaceholder')}
              />
            </div>
            {eduForm.formState.errors.root?.message && (
              <Alert>{eduForm.formState.errors.root.message}</Alert>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={eduForm.formState.isSubmitting}>
                {eduForm.formState.isSubmitting
                  ? t('applicationForm.saving')
                  : eduEditing
                    ? t('experience.update')
                    : t('common.add')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEduFormOpen(false);
                  setEduEditing(null);
                  eduForm.reset();
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* ── Skills ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <WrenchIcon size={18} /> {t('experience.skillsTitle')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('experience.skillsDescription')}
            </p>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setSkillEditing(null);
              setSkillFormOpen(true);
            }}
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} /> <span className="hidden sm:inline">{t('common.add')}</span>
            </span>
          </Button>
        </div>

        {skillLoading ? (
          <Skeleton className="h-8 w-48 rounded-lg" />
        ) : (
          skills.length === 0 &&
          !skillFormOpen && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('experience.noSkillsYet')}
            </p>
          )
        )}

        {skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              >
                <span className="text-gray-900 dark:text-gray-100">{skill.name}</span>
                {skill.proficiency && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    · {t(`experience.${skill.proficiency}`, { defaultValue: skill.proficiency })}
                  </span>
                )}
                <IconButton
                  label={t('common.edit')}
                  icon={<PencilIcon size={12} />}
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => {
                    setSkillEditing(skill);
                    setSkillFormOpen(true);
                  }}
                />
                <IconButton
                  label={t('common.delete')}
                  icon={<Trash2Icon size={12} />}
                  variant="danger"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteSkill.mutate(skill.id)}
                />
              </div>
            ))}
          </div>
        )}

        {skillFormOpen && (
          <form
            onSubmit={skillForm.handleSubmit((data) =>
              skillEditing ? updateSkill.mutate(data) : createSkill.mutate(data),
            )}
            className="space-y-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <FormLabel>{t('experience.skillLabel')}</FormLabel>
                <Input
                  {...skillForm.register('name')}
                  invalid={!!skillForm.formState.errors.name}
                  placeholder="TypeScript"
                />
                {skillForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-red-600">
                    {skillForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <FormLabel>{t('experience.categoryLabel')}</FormLabel>
                <Input {...skillForm.register('category')} placeholder="Language" />
              </div>
              <div>
                <FormLabel>{t('experience.proficiencyLabel')}</FormLabel>
                <Select {...skillForm.register('proficiency')}>
                  <option value="">{t('experience.selectPlaceholder')}</option>
                  <option value="beginner">{t('experience.beginner')}</option>
                  <option value="intermediate">{t('experience.intermediate')}</option>
                  <option value="advanced">{t('experience.advanced')}</option>
                  <option value="expert">{t('experience.expert')}</option>
                </Select>
              </div>
            </div>
            {skillForm.formState.errors.root?.message && (
              <Alert>{skillForm.formState.errors.root.message}</Alert>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={skillForm.formState.isSubmitting}>
                {skillForm.formState.isSubmitting
                  ? t('applicationForm.saving')
                  : skillEditing
                    ? t('experience.update')
                    : t('common.add')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSkillFormOpen(false);
                  setSkillEditing(null);
                  skillForm.reset();
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
