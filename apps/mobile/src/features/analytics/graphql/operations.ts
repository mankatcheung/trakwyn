// Hand-written to match apps/web's apps/web/src/features/analytics/graphql/*
// modules field-for-field — see
// ../../applications/graphql/operations.ts for why these stay hand-typed
// rather than codegen'd.

export const ANALYTICS_APPLICATIONS_QUERY = `
  query AnalyticsApplications {
    applications {
      id company role status appliedAt createdAt likelyGhosted
    }
  }
`;

export const DOCUMENT_VERSION_OUTCOMES_QUERY = `
  query DocumentVersionOutcomes {
    documentVersionOutcomes {
      documentType
      version
      applicationCount
      interviewCount
      interviewRate
    }
  }
`;

export const INTERVIEW_ROUND_ANALYTICS_QUERY = `
  query InterviewRoundAnalytics {
    interviewRoundAnalytics {
      byType {
        type
        passed
        failed
        pending
        cancelled
      }
      roundsToOffer {
        average
        median
        sampleSize
      }
      roundsToRejection {
        average
        median
        sampleSize
      }
    }
  }
`;

export const OFFER_ANALYTICS_QUERY = `
  query OfferAnalytics {
    offerAnalytics {
      trend {
        offerId
        applicationId
        company
        role
        createdAt
        currency
        normalizedYearlySalary
      }
      byCurrency {
        currency
        count
        minYearlySalary
        maxYearlySalary
        medianYearlySalary
        averageYearlySalary
      }
    }
  }
`;

export const APPLICATION_CHANNEL_ANALYTICS_QUERY = `
  query ApplicationChannelAnalytics {
    applicationChannelAnalytics {
      bySource {
        label
        applicationCount
        respondedCount
        responseRate
        offerCount
        offerRate
      }
      byTag {
        label
        applicationCount
        respondedCount
        responseRate
        offerCount
        offerRate
      }
    }
  }
`;

export const RESPONSE_TIME_ANALYTICS_QUERY = `
  query ResponseTimeAnalytics {
    responseTimeAnalytics {
      timeInStage {
        status
        averageDays
        medianDays
        sampleSize
      }
      timeToFirstResponse {
        averageDays
        medianDays
        sampleSize
      }
    }
  }
`;
