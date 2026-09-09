// Hand-written to match apps/web's applications/$applicationId/offers/*
// field-for-field — see ../../applications/graphql/operations.ts for why
// these stay hand-typed rather than codegen'd.

export const OFFERS_QUERY = `
  query Offers($applicationId: ID!) {
    offers(applicationId: $applicationId) {
      id
      applicationId
      baseSalary
      bonus
      equity
      benefits
      costOfLivingAdjustment
      currency
      period
      notes
      createdAt
      updatedAt
    }
  }
`;

export const MY_OFFERS_QUERY = `
  query MyOffers {
    myOffers {
      company
      role
      offer {
        id
        applicationId
        baseSalary
        bonus
        equity
        benefits
        costOfLivingAdjustment
        currency
        period
        notes
        createdAt
        updatedAt
      }
    }
  }
`;

export const CREATE_OFFER_MUTATION = `
  mutation CreateOffer($input: CreateOfferInput!) {
    createOffer(input: $input) {
      id
    }
  }
`;

export const UPDATE_OFFER_MUTATION = `
  mutation UpdateOffer($input: UpdateOfferInput!) {
    updateOffer(input: $input) {
      id
    }
  }
`;

export const DELETE_OFFER_MUTATION = `
  mutation DeleteOffer($id: ID!) {
    deleteOffer(id: $id)
  }
`;

export const COMPARE_OFFERS_MUTATION = `
  mutation CompareOffers($offerIds: [String!]!) {
    compareOffers(offerIds: $offerIds) {
      offer {
        id
        baseSalary
        bonus
        equity
        benefits
        costOfLivingAdjustment
        currency
        period
      }
      company
      role
      normalizedYearlySalary
      totalCompensation
    }
  }
`;
