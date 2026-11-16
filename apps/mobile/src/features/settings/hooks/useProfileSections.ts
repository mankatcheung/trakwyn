import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  AWARDS_QUERY,
  CERTIFICATIONS_QUERY,
  CREATE_AWARD_MUTATION,
  CREATE_CERTIFICATION_MUTATION,
  CREATE_LANGUAGE_MUTATION,
  CREATE_PROJECT_MUTATION,
  DELETE_AWARD_MUTATION,
  DELETE_CERTIFICATION_MUTATION,
  DELETE_LANGUAGE_MUTATION,
  DELETE_PROJECT_MUTATION,
  LANGUAGES_QUERY,
  PROJECTS_QUERY,
  UPDATE_AWARD_MUTATION,
  UPDATE_CERTIFICATION_MUTATION,
  UPDATE_LANGUAGE_MUTATION,
  UPDATE_PROJECT_MUTATION,
} from '../graphql/operations';
import type {
  Award,
  Certification,
  CreateAwardInput,
  CreateCertificationInput,
  CreateLanguageInput,
  CreateProjectInput,
  Language,
  Project,
} from '../types';

export const certificationsQueryKey = ['certifications'] as const;
export const languagesQueryKey = ['languages'] as const;
export const projectsQueryKey = ['projects'] as const;
export const awardsQueryKey = ['awards'] as const;

interface SectionDocuments {
  /** The query's root field, which holds the list. */
  field: string;
  query: string;
  create: string;
  update: string;
  remove: string;
}

/** The list, create, update and delete hooks of one profile section, on the same key-and-invalidate pattern as `useExperience`. */
function createSectionHooks<Item, Input>(queryKey: readonly string[], docs: SectionDocuments) {
  function useList() {
    return useQuery({
      queryKey,
      queryFn: () =>
        gqlRequest<Record<string, Item[]>>(docs.query).then((d) => d[docs.field] ?? []),
    });
  }

  function useCreate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (input: Input) => gqlRequest(docs.create, { input }),
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    });
  }

  function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: Input }) =>
        gqlRequest(docs.update, { id, input }),
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    });
  }

  function useDelete() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => gqlRequest(docs.remove, { id }),
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    });
  }

  return { useList, useCreate, useUpdate, useDelete };
}

const certifications = createSectionHooks<Certification, CreateCertificationInput>(
  certificationsQueryKey,
  {
    field: 'certifications',
    query: CERTIFICATIONS_QUERY,
    create: CREATE_CERTIFICATION_MUTATION,
    update: UPDATE_CERTIFICATION_MUTATION,
    remove: DELETE_CERTIFICATION_MUTATION,
  },
);
export const useCertifications = certifications.useList;
export const useCreateCertification = certifications.useCreate;
export const useUpdateCertification = certifications.useUpdate;
export const useDeleteCertification = certifications.useDelete;

const languages = createSectionHooks<Language, CreateLanguageInput>(languagesQueryKey, {
  field: 'languages',
  query: LANGUAGES_QUERY,
  create: CREATE_LANGUAGE_MUTATION,
  update: UPDATE_LANGUAGE_MUTATION,
  remove: DELETE_LANGUAGE_MUTATION,
});
export const useLanguages = languages.useList;
export const useCreateLanguage = languages.useCreate;
export const useUpdateLanguage = languages.useUpdate;
export const useDeleteLanguage = languages.useDelete;

const projects = createSectionHooks<Project, CreateProjectInput>(projectsQueryKey, {
  field: 'projects',
  query: PROJECTS_QUERY,
  create: CREATE_PROJECT_MUTATION,
  update: UPDATE_PROJECT_MUTATION,
  remove: DELETE_PROJECT_MUTATION,
});
export const useProjects = projects.useList;
export const useCreateProject = projects.useCreate;
export const useUpdateProject = projects.useUpdate;
export const useDeleteProject = projects.useDelete;

const awards = createSectionHooks<Award, CreateAwardInput>(awardsQueryKey, {
  field: 'awards',
  query: AWARDS_QUERY,
  create: CREATE_AWARD_MUTATION,
  update: UPDATE_AWARD_MUTATION,
  remove: DELETE_AWARD_MUTATION,
});
export const useAwards = awards.useList;
export const useCreateAward = awards.useCreate;
export const useUpdateAward = awards.useUpdate;
export const useDeleteAward = awards.useDelete;
