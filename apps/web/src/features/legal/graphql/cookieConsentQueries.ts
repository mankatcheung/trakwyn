import { graphql } from '#/graphql/generated';

export const RECORD_COOKIE_CONSENT_MUTATION = graphql(`
  mutation RecordCookieConsent($analyticsAccepted: Boolean!) {
    recordCookieConsent(analyticsAccepted: $analyticsAccepted)
  }
`);
