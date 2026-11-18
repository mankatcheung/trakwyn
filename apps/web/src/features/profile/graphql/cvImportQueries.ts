import { graphql } from '#/graphql/generated';

/** The confirm step of the CV import (JEF-461); reading the file is `uploadCv` in `lib/cvImport`. */
export const IMPORT_CV_PROFILE = graphql(`
  mutation ImportCvProfile($input: ImportCvProfileInput!) {
    importCvProfile(input: $input) {
      workExperiences
      educations
      skills
      certifications
      languages
      projects
      awards
    }
  }
`);

/** A cheap authenticated read: it makes `gqlClient` refresh an expired token before the upload retries. */
export const CV_IMPORT_SESSION_PROBE = graphql(`
  query CvImportSession {
    me {
      id
    }
  }
`);
