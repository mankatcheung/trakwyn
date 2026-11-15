import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { CertificationRef } from '#src/http/schema/types/CertificationType.js';
import {
  CreateCertificationInput,
  UpdateCertificationInput,
} from '#src/http/schema/types/inputs/CertificationInputs.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createCertification', (t) =>
  t.field({
    type: CertificationRef,
    args: {
      input: t.arg({ type: CreateCertificationInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { certificationResolver } = ctx.diScope.cradle;
      return certificationResolver.createCertification(ctx.user.sub, {
        name: args.input.name,
        issuer: args.input.issuer ?? undefined,
        issuedAt: args.input.issuedAt ?? undefined,
        expiresAt: args.input.expiresAt ?? undefined,
        credentialUrl: args.input.credentialUrl ?? undefined,
      });
    },
  }),
);

builder.mutationField('updateCertification', (t) =>
  t.field({
    type: CertificationRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateCertificationInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { certificationResolver } = ctx.diScope.cradle;
      return certificationResolver.updateCertification(ctx.user.sub, args.id, {
        name: args.input.name ?? undefined,
        issuer: args.input.issuer,
        issuedAt: args.input.issuedAt,
        expiresAt: args.input.expiresAt,
        credentialUrl: args.input.credentialUrl,
      });
    },
  }),
);

builder.mutationField('deleteCertification', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { certificationResolver } = ctx.diScope.cradle;
      await certificationResolver.deleteCertification(ctx.user.sub, args.id);
      return true;
    },
  }),
);
