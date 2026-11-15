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

export const ImportCvCertificationInput = builder.inputType('ImportCvCertificationInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    issuer: t.string({ required: false }),
    issuedAt: t.string({ required: false }),
    expiresAt: t.string({ required: false }),
    credentialUrl: t.string({ required: false }),
  }),
});

export const ImportCvLanguageInput = builder.inputType('ImportCvLanguageInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    proficiency: t.string({ required: false }),
  }),
});

export const ImportCvProjectInput = builder.inputType('ImportCvProjectInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    role: t.string({ required: false }),
    url: t.string({ required: false }),
    startDate: t.string({ required: false }),
    endDate: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const ImportCvAwardInput = builder.inputType('ImportCvAwardInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    issuer: t.string({ required: false }),
    date: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const ImportCvContactInput = builder.inputType('ImportCvContactInput', {
  fields: (t) => ({
    phone: t.string({ required: false }),
    location: t.string({ required: false }),
    links: t.stringList({ required: false }),
  }),
});

export const ImportCvProfileInput = builder.inputType('ImportCvProfileInput', {
  fields: (t) => ({
    contact: t.field({ type: ImportCvContactInput, required: false }),
    workExperiences: t.field({ type: [ImportCvWorkExperienceInput], required: true }),
    educations: t.field({ type: [ImportCvEducationInput], required: true }),
    skills: t.field({ type: [ImportCvSkillInput], required: true }),
    // Optional: a client from before JEF-592 does not send them.
    certifications: t.field({ type: [ImportCvCertificationInput], required: false }),
    languages: t.field({ type: [ImportCvLanguageInput], required: false }),
    projects: t.field({ type: [ImportCvProjectInput], required: false }),
    awards: t.field({ type: [ImportCvAwardInput], required: false }),
  }),
});
