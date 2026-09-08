// Hand-written to match apps/web's apps/web/src/graphql/{queries,mutations}/applications.graphql
// field-for-field. Codegen (JEF-261's stack decision) isn't wired up yet for
// apps/mobile — see the mobile app README/ticket follow-up — so these stay
// hand-typed in ../types.ts until then.

const APPLICATION_FIELDS = `
  id
  company
  role
  status
  jobUrl
  location
  salaryRange
  description
  appliedAt
  starred
  source
  followUpAt
  tags
  createdAt
  updatedAt
  deletedAt
  purgeAt
  boardPosition
  likelyGhosted
`;

export const APPLICATIONS_QUERY = `
  query Applications($status: ApplicationStatus) {
    applications(status: $status) {
      ${APPLICATION_FIELDS}
    }
  }
`;

export const APPLICATION_QUERY = `
  query Application($id: ID!) {
    application(id: $id) {
      ${APPLICATION_FIELDS}
    }
  }
`;

export const TRASHED_APPLICATIONS_QUERY = `
  query TrashedApplications {
    trashedApplications {
      ${APPLICATION_FIELDS}
    }
  }
`;

export const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) {
      ${APPLICATION_FIELDS}
    }
  }
`;

export const UPDATE_APPLICATION_MUTATION = `
  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) {
      ${APPLICATION_FIELDS}
    }
  }
`;

export const DELETE_APPLICATION_MUTATION = `
  mutation DeleteApplication($id: ID!) {
    deleteApplication(id: $id)
  }
`;

export const RESTORE_APPLICATION_MUTATION = `
  mutation RestoreApplication($id: ID!) {
    restoreApplication(id: $id)
  }
`;

export const PERMANENTLY_DELETE_APPLICATION_MUTATION = `
  mutation PermanentlyDeleteApplication($id: ID!) {
    permanentlyDeleteApplication(id: $id)
  }
`;

export const MOVE_APPLICATION_ON_BOARD_MUTATION = `
  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {
    moveApplicationOnBoard(input: $input) {
      id
      status
      boardPosition
    }
  }
`;

export const APPLICATION_HEALTH_SCORE_QUERY = `
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
`;

export const ACTIVITY_LOGS_QUERY = `
  query ActivityLogs($applicationId: ID!) {
    activityLogs(applicationId: $applicationId) {
      id
      eventType
      payload
      createdAt
    }
  }
`;
