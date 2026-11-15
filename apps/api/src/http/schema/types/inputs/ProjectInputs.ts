import { builder } from '#src/http/schema/builder.js';

export const CreateProjectInput = builder.inputType('CreateProjectInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    role: t.string({ required: false }),
    url: t.string({ required: false }),
    startDate: t.string({ required: false }),
    endDate: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const UpdateProjectInput = builder.inputType('UpdateProjectInput', {
  fields: (t) => ({
    name: t.string({ required: false }),
    role: t.string({ required: false }),
    url: t.string({ required: false }),
    startDate: t.string({ required: false }),
    endDate: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});
