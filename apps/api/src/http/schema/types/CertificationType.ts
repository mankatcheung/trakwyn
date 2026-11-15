import { builder } from '#src/http/schema/builder.js';
import type { CertificationDTO } from '#src/interface-adapters/mappers/CertificationMapper.js';

export const CertificationRef = builder.objectRef<CertificationDTO>('Certification');
CertificationRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeID('userId'),
    name: t.exposeString('name'),
    issuer: t.exposeString('issuer', { nullable: true }),
    issuedAt: t.exposeString('issuedAt', { nullable: true }),
    expiresAt: t.exposeString('expiresAt', { nullable: true }),
    credentialUrl: t.exposeString('credentialUrl', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
  }),
});
