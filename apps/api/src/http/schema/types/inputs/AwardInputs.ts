import { builder } from '#src/http/schema/builder.js';

export const CreateAwardInput = builder.inputType('CreateAwardInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    issuer: t.string({ required: false }),
    date: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});

export const UpdateAwardInput = builder.inputType('UpdateAwardInput', {
  fields: (t) => ({
    title: t.string({ required: false }),
    issuer: t.string({ required: false }),
    date: t.string({ required: false }),
    description: t.string({ required: false }),
  }),
});
