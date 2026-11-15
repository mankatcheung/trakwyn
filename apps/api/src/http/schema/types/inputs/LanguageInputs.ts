import { builder } from '#src/http/schema/builder.js';

export const CreateLanguageInput = builder.inputType('CreateLanguageInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    proficiency: t.string({ required: false }),
  }),
});

export const UpdateLanguageInput = builder.inputType('UpdateLanguageInput', {
  fields: (t) => ({
    name: t.string({ required: false }),
    proficiency: t.string({ required: false }),
  }),
});
