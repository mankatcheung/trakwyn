import { builder } from '#src/http/schema/builder.js';
import type { OfferDTO } from '#src/interface-adapters/mappers/OfferMapper.js';

export const OfferRef = builder.objectRef<OfferDTO>('Offer');

OfferRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    baseSalary: t.exposeInt('baseSalary'),
    bonus: t.exposeInt('bonus', { nullable: true }),
    equity: t.exposeString('equity', { nullable: true }),
    benefits: t.exposeString('benefits', { nullable: true }),
    costOfLivingAdjustment: t.exposeInt('costOfLivingAdjustment', { nullable: true }),
    currency: t.exposeString('currency'),
    period: t.exposeString('period'),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});

export interface OfferWithApplicationDTO {
  offer: OfferDTO;
  company: string;
  role: string;
}

export const OfferWithApplicationRef =
  builder.objectRef<OfferWithApplicationDTO>('OfferWithApplication');

OfferWithApplicationRef.implement({
  fields: (t) => ({
    offer: t.field({
      type: OfferRef,
      resolve: (parent) => parent.offer,
    }),
    company: t.exposeString('company'),
    role: t.exposeString('role'),
  }),
});

export interface OfferComparisonDTO {
  offer: OfferDTO;
  company: string;
  role: string;
  normalizedYearlySalary: number;
  totalCompensation: number;
}

export const OfferComparisonRef = builder.objectRef<OfferComparisonDTO>('OfferComparison');

OfferComparisonRef.implement({
  fields: (t) => ({
    offer: t.field({
      type: OfferRef,
      resolve: (parent) => parent.offer,
    }),
    company: t.exposeString('company'),
    role: t.exposeString('role'),
    normalizedYearlySalary: t.exposeInt('normalizedYearlySalary'),
    totalCompensation: t.exposeInt('totalCompensation'),
  }),
});
