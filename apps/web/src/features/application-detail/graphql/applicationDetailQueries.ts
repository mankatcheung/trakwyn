/** Typed documents for an application's detail page and its tabs. */

import { graphql } from '#/graphql/generated';

export const UPDATE_APPLICATION = graphql(`
  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) {
      id
    }
  }
`);

export const UPDATE_APPLICATION_FLAGS = graphql(`
  mutation UpdateApplicationFlags($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) {
      id
      starred
      status
    }
  }
`);

export const HEALTH_SCORE_QUERY = graphql(`
  query ApplicationHealthScore($applicationId: ID!) {
    applicationHealthScore(applicationId: $applicationId) {
      score
      label
      criteria {
        key
        label
        points
        earned
        met
      }
    }
  }
`);

export const SECTION_COUNTS_QUERY = graphql(`
  query ApplicationSectionCounts($id: ID!) {
    application(id: $id) {
      id
      sectionCounts {
        notes
        interviews
        contacts
        offers
        companyBriefing
      }
    }
  }
`);

export const ACTIVITY_LOGS_QUERY = graphql(`
  query ActivityLogs($applicationId: ID!) {
    activityLogs(applicationId: $applicationId) {
      id
      eventType
      payload
      createdAt
    }
  }
`);

export const COMPANY_BRIEFING_QUERY = graphql(`
  query CompanyBriefing($applicationId: ID!) {
    companyBriefing(applicationId: $applicationId) {
      id
      applicationId
      content
      sources {
        url
        title
        publishedAt
      }
      generatedAt
    }
  }
`);

export const GENERATE_COMPANY_BRIEFING = graphql(`
  mutation GenerateCompanyBriefing($applicationId: ID!, $instructions: String) {
    generateCompanyBriefing(applicationId: $applicationId, instructions: $instructions) {
      id
      applicationId
      content
      sources {
        url
        title
        publishedAt
      }
      generatedAt
    }
  }
`);

export const CONTACTS_QUERY = graphql(`
  query Contacts($applicationId: ID!) {
    contacts(applicationId: $applicationId) {
      id
      applicationId
      name
      role
      email
      phone
      linkedinUrl
      notes
      createdAt
      updatedAt
    }
  }
`);

export const CREATE_CONTACT = graphql(`
  mutation CreateContact(
    $applicationId: ID!
    $name: String!
    $role: String
    $email: String
    $phone: String
    $linkedinUrl: String
    $notes: String
  ) {
    createContact(
      applicationId: $applicationId
      name: $name
      role: $role
      email: $email
      phone: $phone
      linkedinUrl: $linkedinUrl
      notes: $notes
    ) {
      id
      applicationId
      name
      role
      email
      phone
      linkedinUrl
      notes
      createdAt
      updatedAt
    }
  }
`);

export const UPDATE_CONTACT = graphql(`
  mutation UpdateContact(
    $id: ID!
    $name: String
    $role: String
    $email: String
    $phone: String
    $linkedinUrl: String
    $notes: String
  ) {
    updateContact(
      id: $id
      name: $name
      role: $role
      email: $email
      phone: $phone
      linkedinUrl: $linkedinUrl
      notes: $notes
    ) {
      id
      applicationId
      name
      role
      email
      phone
      linkedinUrl
      notes
      createdAt
      updatedAt
    }
  }
`);

export const DELETE_CONTACT = graphql(`
  mutation DeleteContact($id: ID!) {
    deleteContact(id: $id)
  }
`);
