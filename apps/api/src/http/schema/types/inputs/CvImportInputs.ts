import { builder } from '#src/http/schema/builder.js';

/**
 * What the CV import's review step sends back (JEF-461): the entries the user
 * ticked, as edited. Dates are `YYYY-MM` or a full ISO date.
 */
export const ImportCvWorkExperienceInput = builder.inputType('ImportCvWorkExperienceInput', {
  fields: (t) => ({
    company: t.string({ required: true }),
    title: t.string({ required: true }),
    location: t.string({ required: false }),
    startDate: t.string({ required: true }),
    endDate: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const ImportCvEducationInput = builder.inputType('ImportCvEducationInput', {
  fields: (t) => ({
    institution: t.string({ required: true }),
    degree: t.string({ required: false }),
    field: t.string({ required: false }),
    startDate: t.string({ required: true }),
    endDate: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const ImportCvSkillInput = builder.inputType('ImportCvSkillInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    category: t.string({ required: false }),
    proficiency: t.string({ required: false }),
  }),
});

export const ImportCvProfileInput = builder.inputType('ImportCvProfileInput', {
  fields: (t) => ({
    workExperiences: t.field({ type: [ImportCvWorkExperienceInput], required: true }),
    educations: t.field({ type: [ImportCvEducationInput], required: true }),
    skills: t.field({ type: [ImportCvSkillInput], required: true }),
  }),
});
