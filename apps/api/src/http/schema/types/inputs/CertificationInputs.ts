import { builder } from '#src/http/schema/builder.js';

export const CreateCertificationInput = builder.inputType('CreateCertificationInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    issuer: t.string({ required: false }),
    issuedAt: t.string({ required: false }),
    expiresAt: t.string({ required: false }),
    credentialUrl: t.string({ required: false }),
  }),
});

export const UpdateCertificationInput = builder.inputType('UpdateCertificationInput', {
  fields: (t) => ({
    name: t.string({ required: false }),
    issuer: t.string({ required: false }),
    issuedAt: t.string({ required: false }),
    expiresAt: t.string({ required: false }),
    credentialUrl: t.string({ required: false }),
  }),
});
