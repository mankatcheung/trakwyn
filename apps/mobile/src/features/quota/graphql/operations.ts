export const CONTENT_QUOTA_QUERY = `
  query ContentQuota {
    contentQuota {
      limits {
        notesPerApplication
        contactsPerApplication
        interviewRoundsPerApplication
        offersPerApplication
        tagsPerApplication
        documentDraftsPerApplication
        conversationsPerUser
        workExperiencesPerUser
        educationsPerUser
        skillsPerUser
        shareLinksPerUser
        apiTokensPerUser
      }
      usage {
        conversations
        workExperiences
        educations
        skills
        shareLinks
        apiTokens
      }
    }
  }
`;
