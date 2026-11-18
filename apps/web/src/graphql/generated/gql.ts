/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
  '\n  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n': typeof types.UpdateApplicationDocument;
  '\n  mutation UpdateApplicationFlags($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n      starred\n      status\n    }\n  }\n': typeof types.UpdateApplicationFlagsDocument;
  '\n  query ApplicationHealthScore($applicationId: ID!) {\n    applicationHealthScore(applicationId: $applicationId) {\n      score\n      label\n      criteria {\n        key\n        label\n        points\n        earned\n        met\n      }\n    }\n  }\n': typeof types.ApplicationHealthScoreDocument;
  '\n  query ApplicationSectionCounts($id: ID!) {\n    application(id: $id) {\n      id\n      sectionCounts {\n        notes\n        interviews\n        contacts\n        offers\n        companyBriefing\n      }\n    }\n  }\n': typeof types.ApplicationSectionCountsDocument;
  '\n  query ActivityLogs($applicationId: ID!) {\n    activityLogs(applicationId: $applicationId) {\n      id\n      eventType\n      payload\n      createdAt\n    }\n  }\n': typeof types.ActivityLogsDocument;
  '\n  query CompanyBriefing($applicationId: ID!) {\n    companyBriefing(applicationId: $applicationId) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n': typeof types.CompanyBriefingDocument;
  '\n  mutation GenerateCompanyBriefing($applicationId: ID!, $instructions: String) {\n    generateCompanyBriefing(applicationId: $applicationId, instructions: $instructions) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n': typeof types.GenerateCompanyBriefingDocument;
  '\n  query Contacts($applicationId: ID!) {\n    contacts(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.ContactsDocument;
  '\n  mutation CreateContact(\n    $applicationId: ID!\n    $name: String!\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    createContact(\n      applicationId: $applicationId\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateContactDocument;
  '\n  mutation UpdateContact(\n    $id: ID!\n    $name: String\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    updateContact(\n      id: $id\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateContactDocument;
  '\n  mutation DeleteContact($id: ID!) {\n    deleteContact(id: $id)\n  }\n': typeof types.DeleteContactDocument;
  '\n  query Application($id: ID!) {\n    application(id: $id) {\n      id\n      company\n      role\n      status\n      jobUrl\n      location\n      salaryRange\n      description\n      postingText\n      appliedAt\n      starred\n      source\n      followUpAt\n      tags\n      createdAt\n      updatedAt\n      deletedAt\n      purgeAt\n    }\n  }\n': typeof types.ApplicationDocument;
  '\n  mutation BulkUpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n': typeof types.BulkUpdateApplicationDocument;
  '\n  mutation CreateApplication($input: CreateApplicationInput!) {\n    createApplication(input: $input) {\n      id\n    }\n  }\n': typeof types.CreateApplicationDocument;
  '\n  mutation ParseJobDescription($text: String, $url: String) {\n    parseJobDescription(text: $text, url: $url) {\n      company\n      role\n      location\n      salary\n      description\n      postingText\n    }\n  }\n': typeof types.ParseJobDescriptionDocument;
  '\n  mutation DeleteApplication($id: ID!) {\n    deleteApplication(id: $id)\n  }\n': typeof types.DeleteApplicationDocument;
  'query Applications($status: ApplicationStatus) {\n  applications(status: $status) {\n    id\n    company\n    role\n    status\n    jobUrl\n    location\n    salaryRange\n    appliedAt\n    starred\n    source\n    followUpAt\n    tags\n    createdAt\n    updatedAt\n  }\n}': typeof types.ApplicationsDocument;
  '\n  query ApplicationsPage(\n    $status: ApplicationStatus\n    $starred: Boolean\n    $search: String\n    $cursor: String\n    $limit: Int\n    $likelyGhosted: Boolean\n  ) {\n    applicationsPage(\n      status: $status\n      starred: $starred\n      search: $search\n      cursor: $cursor\n      limit: $limit\n      likelyGhosted: $likelyGhosted\n    ) {\n      hasNextPage\n      nextCursor\n      items {\n        id\n        company\n        role\n        status\n        location\n        description\n        appliedAt\n        starred\n        source\n        followUpAt\n        tags\n        createdAt\n      }\n    }\n  }\n': typeof types.ApplicationsPageDocument;
  '\n  query BoardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      starred\n      createdAt\n      tags\n      likelyGhosted\n      boardPosition\n    }\n  }\n': typeof types.BoardApplicationsDocument;
  '\n  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {\n    moveApplicationOnBoard(input: $input) {\n      id\n      status\n      boardPosition\n    }\n  }\n': typeof types.MoveApplicationOnBoardDocument;
  '\n  query TrashedApplications {\n    trashedApplications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      deletedAt\n      purgeAt\n    }\n  }\n': typeof types.TrashedApplicationsDocument;
  '\n  mutation RestoreApplication($id: ID!) {\n    restoreApplication(id: $id)\n  }\n': typeof types.RestoreApplicationDocument;
  '\n  mutation PermanentlyDeleteApplication($id: ID!) {\n    permanentlyDeleteApplication(id: $id)\n  }\n': typeof types.PermanentlyDeleteApplicationDocument;
  '\n  mutation BulkRestoreApplications($ids: [ID!]!) {\n    bulkRestoreApplications(ids: $ids) {\n      restored\n    }\n  }\n': typeof types.BulkRestoreApplicationsDocument;
  '\n  mutation EmptyTrash {\n    emptyTrash {\n      deleted\n      failed\n    }\n  }\n': typeof types.EmptyTrashDocument;
  'mutation Register($email: String!, $password: String!, $captchaToken: String) {\n  register(email: $email, password: $password, captchaToken: $captchaToken)\n}\n\nmutation Login($email: String!, $password: String!, $captchaToken: String) {\n  login(email: $email, password: $password, captchaToken: $captchaToken) {\n    success\n    totpRequired\n    accessToken\n  }\n}\n\nmutation LoginWithTotp($email: String!, $password: String!, $code: String!) {\n  loginWithTotp(email: $email, password: $password, code: $code)\n}\n\nmutation RefreshToken {\n  refreshToken\n}\n\nmutation Logout {\n  logout\n}': typeof types.RegisterDocument;
  '\n  query DashboardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      starred\n      followUpAt\n      createdAt\n    }\n  }\n': typeof types.DashboardApplicationsDocument;
  '\n  query DashboardCalendarEvents {\n    calendarEvents {\n      id\n      applicationId\n      company\n      role\n      type\n      date\n      interviewRoundType\n    }\n  }\n': typeof types.DashboardCalendarEventsDocument;
  '\n  query WeeklyApplicationGoal {\n    weeklyApplicationGoal {\n      weeklyApplicationGoal\n      currentWeekCount\n      currentWeekStart\n      streakWeeks\n    }\n  }\n': typeof types.WeeklyApplicationGoalDocument;
  '\n  query OnboardingChecklist {\n    me {\n      onboardingChecklistDismissedAt\n      onboardingGoals\n      aiCredits {\n        used\n        limit\n        bonusRemaining\n      }\n    }\n    apiTokens {\n      id\n    }\n    llmApiKeys {\n      provider\n    }\n    workExperiences {\n      id\n    }\n  }\n': typeof types.OnboardingChecklistDocument;
  '\n  mutation DismissOnboardingChecklist {\n    dismissOnboardingChecklist\n  }\n': typeof types.DismissOnboardingChecklistDocument;
  '\n  mutation GenerateIntoDocumentDraft(\n    $draftId: ID!\n    $instructions: String\n    $resumeDocumentId: ID\n    $resumeDraftId: ID\n  ) {\n    generateIntoDocumentDraft(\n      draftId: $draftId\n      instructions: $instructions\n      resumeDocumentId: $resumeDocumentId\n      resumeDraftId: $resumeDraftId\n    ) {\n      contentJson\n      plainText\n    }\n  }\n': typeof types.GenerateIntoDocumentDraftDocument;
  '\n  mutation ExtractDocumentText($documentId: ID!) {\n    extractDocumentText(documentId: $documentId) {\n      text\n    }\n  }\n': typeof types.ExtractDocumentTextDocument;
  '\n  query Documents($applicationId: ID!) {\n    documents(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n': typeof types.DocumentsDocument;
  '\n  query DocumentDrafts($applicationId: ID!) {\n    documentDrafts(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      title\n      plainText\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.DocumentDraftsDocument;
  '\n  mutation RequestUploadUrl($input: RequestUploadUrlInput!) {\n    requestUploadUrl(input: $input) {\n      uploadUrl\n      storageKey\n      access\n    }\n  }\n': typeof types.RequestUploadUrlDocument;
  '\n  mutation ConfirmDocument($input: ConfirmDocumentInput!) {\n    confirmDocument(input: $input) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n': typeof types.ConfirmDocumentDocument;
  '\n  mutation DeleteDocument($id: ID!) {\n    deleteDocument(id: $id)\n  }\n': typeof types.DeleteDocumentDocument;
  '\n  query DocumentDraft($id: ID!) {\n    documentDraft(id: $id) {\n      id\n      applicationId\n      type\n      title\n      contentJson\n      plainText\n      sourceDocumentId\n      aiInstructions\n      aiGenerated\n      myRating {\n        rating\n        reason\n      }\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.DocumentDraftDocument;
  '\n  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {\n    updateDocumentDraftContent(input: $input) {\n      id\n      updatedAt\n    }\n  }\n': typeof types.UpdateDocumentDraftContentDocument;
  '\n  mutation ExportDocumentDraftToPdf($draftId: ID!) {\n    exportDocumentDraftToPdf(draftId: $draftId) {\n      id\n      name\n      url\n    }\n  }\n': typeof types.ExportDocumentDraftToPdfDocument;
  '\n  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {\n    renameDocumentDraft(draftId: $draftId, title: $title) {\n      id\n      title\n    }\n  }\n': typeof types.RenameDocumentDraftDocument;
  '\n  mutation DeleteDocumentDraft($id: ID!) {\n    deleteDocumentDraft(id: $id)\n  }\n': typeof types.DeleteDocumentDraftDocument;
  '\n  query DocumentDraftVersions($draftId: ID!) {\n    documentDraftVersions(draftId: $draftId) {\n      id\n      source\n      characterCount\n      createdAt\n    }\n  }\n': typeof types.DocumentDraftVersionsDocument;
  '\n  query DocumentDraftVersion($id: ID!) {\n    documentDraftVersion(id: $id) {\n      id\n      source\n      plainText\n      createdAt\n    }\n  }\n': typeof types.DocumentDraftVersionDocument;
  '\n  mutation CreateDocumentDraftVersion($draftId: ID!) {\n    createDocumentDraftVersion(draftId: $draftId) {\n      id\n      source\n    }\n  }\n': typeof types.CreateDocumentDraftVersionDocument;
  '\n  mutation RestoreDocumentDraftVersion($versionId: ID!) {\n    restoreDocumentDraftVersion(versionId: $versionId) {\n      id\n      contentJson\n      plainText\n    }\n  }\n': typeof types.RestoreDocumentDraftVersionDocument;
  '\n  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {\n    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {\n      markdown\n    }\n  }\n': typeof types.PolishDocumentDraftDocument;
  '\n  query PostingRequirements($applicationId: ID!) {\n    postingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n': typeof types.PostingRequirementsDocument;
  '\n  mutation ExtractPostingRequirements($applicationId: ID!) {\n    extractPostingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n': typeof types.ExtractPostingRequirementsDocument;
  '\n  query ResumeAtsScores($applicationId: ID!) {\n    resumeAtsScores(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n': typeof types.ResumeAtsScoresDocument;
  '\n  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {\n    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n': typeof types.ComputeResumeAtsScoreDocument;
  '\n  query ResumeGaps($applicationId: ID!) {\n    resumeGaps(applicationId: $applicationId) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n': typeof types.ResumeGapsDocument;
  '\n  mutation DismissResumeGap($applicationId: ID!, $key: String!) {\n    dismissResumeGap(applicationId: $applicationId, key: $key) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n': typeof types.DismissResumeGapDocument;
  '\n  query ResumeMatches($applicationId: ID!) {\n    resumeMatches(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n': typeof types.ResumeMatchesDocument;
  '\n  mutation ComputeResumeMatchScore($applicationId: ID!, $documentDraftId: ID, $documentId: ID) {\n    computeResumeMatchScore(\n      applicationId: $applicationId\n      documentDraftId: $documentDraftId\n      documentId: $documentId\n    ) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n': typeof types.ComputeResumeMatchScoreDocument;
  '\n  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {\n    createDocumentDraft(input: $input) {\n      id\n      applicationId\n      type\n      title\n    }\n  }\n': typeof types.CreateDocumentDraftDocument;
  '\n  query InterviewQuestions($interviewRoundId: ID!) {\n    interviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.InterviewQuestionsDocument;
  '\n  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {\n    createInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateInterviewQuestionDocument;
  '\n  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {\n    updateInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateInterviewQuestionDocument;
  '\n  mutation DeleteInterviewQuestion($id: ID!) {\n    deleteInterviewQuestion(id: $id)\n  }\n': typeof types.DeleteInterviewQuestionDocument;
  '\n  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.ReorderInterviewQuestionsDocument;
  '\n  query InterviewRounds($applicationId: ID!) {\n    interviewRounds(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.InterviewRoundsDocument;
  '\n  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {\n    createInterviewRound(input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateInterviewRoundDocument;
  '\n  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {\n    updateInterviewRound(id: $id, input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateInterviewRoundDocument;
  '\n  mutation DeleteInterviewRound($id: ID!) {\n    deleteInterviewRound(id: $id)\n  }\n': typeof types.DeleteInterviewRoundDocument;
  '\n  query MockInterviewQuestions($interviewRoundId: ID!) {\n    mockInterviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.MockInterviewQuestionsDocument;
  '\n  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {\n    createMockInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateMockInterviewQuestionDocument;
  '\n  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {\n    updateMockInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateMockInterviewQuestionDocument;
  '\n  mutation DeleteMockInterviewQuestion($id: ID!) {\n    deleteMockInterviewQuestion(id: $id)\n  }\n': typeof types.DeleteMockInterviewQuestionDocument;
  '\n  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.ReorderMockInterviewQuestionsDocument;
  '\n  mutation GenerateMockInterviewQuestions(\n    $interviewRoundId: ID!\n    $prompt: String\n    $count: Int\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewQuestions(\n      interviewRoundId: $interviewRoundId\n      prompt: $prompt\n      count: $count\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      suggestions\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n': typeof types.GenerateMockInterviewQuestionsDocument;
  '\n  mutation GenerateMockInterviewAnswer(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewAnswer(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      answer\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n': typeof types.GenerateMockInterviewAnswerDocument;
  '\n  mutation GenerateMockTalkingPoints(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockTalkingPoints(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      nothingRelevant\n      usedProfile\n      usedDocument\n      question {\n        id\n        interviewRoundId\n        question\n        answer\n        answerSource\n        talkingPoints\n        talkingPointsGeneratedAt\n        position\n        createdAt\n        updatedAt\n      }\n    }\n  }\n': typeof types.GenerateMockTalkingPointsDocument;
  'mutation CreateNote($applicationId: ID!, $content: String!) {\n  createNote(applicationId: $applicationId, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateNote($id: ID!, $content: String!) {\n  updateNote(id: $id, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}': typeof types.CreateNoteDocument;
  'query Notes($applicationId: ID!) {\n  notes(applicationId: $applicationId) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}': typeof types.NotesDocument;
  '\n  query Offers($applicationId: ID!) {\n    offers(applicationId: $applicationId) {\n      id\n      applicationId\n      baseSalary\n      bonus\n      equity\n      benefits\n      costOfLivingAdjustment\n      currency\n      period\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.OffersDocument;
  '\n  mutation CreateOffer($input: CreateOfferInput!) {\n    createOffer(input: $input) {\n      id\n    }\n  }\n': typeof types.CreateOfferDocument;
  '\n  mutation UpdateOffer($input: UpdateOfferInput!) {\n    updateOffer(input: $input) {\n      id\n    }\n  }\n': typeof types.UpdateOfferDocument;
  '\n  mutation DeleteOffer($id: String!) {\n    deleteOffer(id: $id)\n  }\n': typeof types.DeleteOfferDocument;
  '\n  query MyOffers {\n    myOffers {\n      company\n      role\n      offer {\n        id\n        applicationId\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n        notes\n      }\n    }\n  }\n': typeof types.MyOffersDocument;
  '\n  mutation CompareOffers($offerIds: [String!]!) {\n    compareOffers(offerIds: $offerIds) {\n      offer {\n        id\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n      }\n      company\n      role\n      normalizedYearlySalary\n      totalCompensation\n    }\n  }\n': typeof types.CompareOffersDocument;
  '\n  query Awards {\n    awards {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n': typeof types.AwardsDocument;
  '\n  mutation CreateAward($input: CreateAwardInput!) {\n    createAward(input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n': typeof types.CreateAwardDocument;
  '\n  mutation UpdateAward($id: ID!, $input: UpdateAwardInput!) {\n    updateAward(id: $id, input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n': typeof types.UpdateAwardDocument;
  '\n  mutation DeleteAward($id: ID!) {\n    deleteAward(id: $id)\n  }\n': typeof types.DeleteAwardDocument;
  '\n  query Certifications {\n    certifications {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n': typeof types.CertificationsDocument;
  '\n  mutation CreateCertification($input: CreateCertificationInput!) {\n    createCertification(input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n': typeof types.CreateCertificationDocument;
  '\n  mutation UpdateCertification($id: ID!, $input: UpdateCertificationInput!) {\n    updateCertification(id: $id, input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n': typeof types.UpdateCertificationDocument;
  '\n  mutation DeleteCertification($id: ID!) {\n    deleteCertification(id: $id)\n  }\n': typeof types.DeleteCertificationDocument;
  '\n  mutation ImportCvProfile($input: ImportCvProfileInput!) {\n    importCvProfile(input: $input) {\n      workExperiences\n      educations\n      skills\n      certifications\n      languages\n      projects\n      awards\n    }\n  }\n': typeof types.ImportCvProfileDocument;
  '\n  query CvImportSession {\n    me {\n      id\n    }\n  }\n': typeof types.CvImportSessionDocument;
  '\n  query Educations {\n    educations {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.EducationsDocument;
  '\n  mutation CreateEducation($input: CreateEducationInput!) {\n    createEducation(input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateEducationDocument;
  '\n  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n    updateEducation(id: $id, input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateEducationDocument;
  '\n  mutation DeleteEducation($id: ID!) {\n    deleteEducation(id: $id)\n  }\n': typeof types.DeleteEducationDocument;
  '\n  query Languages {\n    languages {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n': typeof types.LanguagesDocument;
  '\n  mutation CreateLanguage($input: CreateLanguageInput!) {\n    createLanguage(input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n': typeof types.CreateLanguageDocument;
  '\n  mutation UpdateLanguage($id: ID!, $input: UpdateLanguageInput!) {\n    updateLanguage(id: $id, input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n': typeof types.UpdateLanguageDocument;
  '\n  mutation DeleteLanguage($id: ID!) {\n    deleteLanguage(id: $id)\n  }\n': typeof types.DeleteLanguageDocument;
  '\n  query Projects {\n    projects {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n': typeof types.ProjectsDocument;
  '\n  mutation CreateProject($input: CreateProjectInput!) {\n    createProject(input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n': typeof types.CreateProjectDocument;
  '\n  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {\n    updateProject(id: $id, input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n': typeof types.UpdateProjectDocument;
  '\n  mutation DeleteProject($id: ID!) {\n    deleteProject(id: $id)\n  }\n': typeof types.DeleteProjectDocument;
  '\n  query Skills {\n    skills {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n': typeof types.SkillsDocument;
  '\n  mutation CreateSkill($input: CreateSkillInput!) {\n    createSkill(input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n': typeof types.CreateSkillDocument;
  '\n  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n    updateSkill(id: $id, input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n': typeof types.UpdateSkillDocument;
  '\n  mutation DeleteSkill($id: ID!) {\n    deleteSkill(id: $id)\n  }\n': typeof types.DeleteSkillDocument;
  '\n  query WorkExperiences {\n    workExperiences {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.WorkExperiencesDocument;
  '\n  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n    createWorkExperience(input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.CreateWorkExperienceDocument;
  '\n  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n    updateWorkExperience(id: $id, input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n': typeof types.UpdateWorkExperienceDocument;
  '\n  mutation DeleteWorkExperience($id: ID!) {\n    deleteWorkExperience(id: $id)\n  }\n': typeof types.DeleteWorkExperienceDocument;
  '\n  query Me {\n    me {\n      id\n      email\n      name\n      timezone\n      targetRole\n      phone\n      location\n      profileLinks\n      avatarUrl\n      backupEmail\n      backupEmailVerifiedAt\n      hasPassword\n    }\n  }\n': typeof types.MeDocument;
  '\n  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {\n    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {\n      uploadUrl\n      storageKey\n    }\n  }\n': typeof types.RequestAvatarUploadUrlDocument;
  '\n  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {\n    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)\n  }\n': typeof types.ConfirmAvatarDocument;
  '\n  mutation RemoveAvatar {\n    removeAvatar\n  }\n': typeof types.RemoveAvatarDocument;
  '\n  mutation UpdateProfile(\n    $name: String\n    $timezone: String\n    $targetRole: String\n    $phone: String\n    $location: String\n    $profileLinks: [String!]\n    $customAiPrompt: String\n    $useCrossApplicationContext: Boolean\n    $llmFallbackWhenLimited: Boolean\n  ) {\n    updateProfile(\n      name: $name\n      timezone: $timezone\n      targetRole: $targetRole\n      phone: $phone\n      location: $location\n      profileLinks: $profileLinks\n      customAiPrompt: $customAiPrompt\n      useCrossApplicationContext: $useCrossApplicationContext\n      llmFallbackWhenLimited: $llmFallbackWhenLimited\n    )\n  }\n': typeof types.UpdateProfileDocument;
  '\n  query ExportUserData {\n    exportUserData\n  }\n': typeof types.ExportUserDataDocument;
  '\n  mutation ImportUserData($data: String!) {\n    importUserData(data: $data) {\n      applicationsImported\n      applicationsSkipped\n      notesImported\n      documentsSkipped\n    }\n  }\n': typeof types.ImportUserDataDocument;
  '\n  query NotificationPreferences {\n    notificationPreferences {\n      weeklyDigestEnabled\n      digestFrequency\n      followUpRemindersEnabled\n      pushNotificationsEnabled\n      weeklyApplicationGoal\n    }\n  }\n': typeof types.NotificationPreferencesDocument;
  '\n  mutation UpdateNotificationPreferences(\n    $digestFrequency: DigestFrequency\n    $followUpRemindersEnabled: Boolean\n    $pushNotificationsEnabled: Boolean\n    $weeklyApplicationGoal: Int\n  ) {\n    updateNotificationPreferences(\n      digestFrequency: $digestFrequency\n      followUpRemindersEnabled: $followUpRemindersEnabled\n      pushNotificationsEnabled: $pushNotificationsEnabled\n      weeklyApplicationGoal: $weeklyApplicationGoal\n    )\n  }\n': typeof types.UpdateNotificationPreferencesDocument;
  '\n  query StorageUsage {\n    me {\n      storageUsedBytes\n      storageLimitBytes\n    }\n  }\n': typeof types.StorageUsageDocument;
  '\n  query LlmApiKeys {\n    llmApiKeys {\n      provider\n      model\n      baseUrl\n      monthlyTokenLimit\n    }\n    me {\n      aiProviderOrder\n      customAiPrompt\n      useCrossApplicationContext\n    }\n  }\n': typeof types.LlmApiKeysDocument;
  '\n  mutation SetAiProviderOrder($order: [String!]!) {\n    setAiProviderOrder(order: $order)\n  }\n': typeof types.SetAiProviderOrderDocument;
  '\n  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {\n    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)\n  }\n': typeof types.SaveLlmApiKeyDocument;
  '\n  mutation DeleteLlmApiKey($provider: String!) {\n    deleteLlmApiKey(provider: $provider)\n  }\n': typeof types.DeleteLlmApiKeyDocument;
  '\n  mutation SetLlmApiKeyMonthlyLimit($provider: String!, $monthlyTokenLimit: Int) {\n    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $monthlyTokenLimit)\n  }\n': typeof types.SetLlmApiKeyMonthlyLimitDocument;
  '\n  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {\n    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {\n      ok\n      error\n    }\n  }\n': typeof types.TestLlmApiKeyDocument;
  '\n  query LlmUsageSummary {\n    llmUsageSummary {\n      provider\n      requestCount\n      promptTokens\n      completionTokens\n      cacheReadTokens\n      cacheWriteTokens\n      lastUsedAt\n      monthlyTokenLimit\n      limitReached\n    }\n  }\n': typeof types.LlmUsageSummaryDocument;
  '\n  query ApiTokens {\n    apiTokens {\n      id\n      name\n      scope\n      lastUsedAt\n      createdAt\n    }\n  }\n': typeof types.ApiTokensDocument;
  '\n  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {\n    createApiToken(name: $name, scope: $scope) {\n      id\n      name\n      token\n      scope\n      createdAt\n    }\n  }\n': typeof types.CreateApiTokenDocument;
  '\n  mutation DeleteApiToken($id: ID!) {\n    deleteApiToken(id: $id)\n  }\n': typeof types.DeleteApiTokenDocument;
  '\n  query McpOAuthGrants {\n    mcpOAuthGrants {\n      id\n      clientName\n      scope\n      authorizedAt\n      lastUsedAt\n    }\n  }\n': typeof types.McpOAuthGrantsDocument;
  '\n  mutation RevokeMcpOAuthGrant($id: ID!) {\n    revokeMcpOAuthGrant(id: $id)\n  }\n': typeof types.RevokeMcpOAuthGrantDocument;
  '\n  query ShareLinks {\n    shareLinks {\n      id\n      name\n      lastUsedAt\n      createdAt\n    }\n  }\n': typeof types.ShareLinksDocument;
  '\n  mutation CreateShareLink($name: String!) {\n    createShareLink(name: $name) {\n      id\n      name\n      token\n      createdAt\n    }\n  }\n': typeof types.CreateShareLinkDocument;
  '\n  mutation DeleteShareLink($id: ID!) {\n    deleteShareLink(id: $id)\n  }\n': typeof types.DeleteShareLinkDocument;
  '\n  mutation RequestEmailChange($currentPassword: String, $newEmail: String!) {\n    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)\n  }\n': typeof types.RequestEmailChangeDocument;
  '\n  mutation RequestAddBackupEmail($currentPassword: String, $backupEmail: String!) {\n    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)\n  }\n': typeof types.RequestAddBackupEmailDocument;
  '\n  mutation RemoveBackupEmail($currentPassword: String) {\n    removeBackupEmail(currentPassword: $currentPassword)\n  }\n': typeof types.RemoveBackupEmailDocument;
  '\n  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {\n    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)\n  }\n': typeof types.UpdatePasswordDocument;
  '\n  mutation Reauthenticate($password: String!, $code: String) {\n    reauthenticate(password: $password, code: $code) {\n      success\n      totpRequired\n      accessToken\n    }\n  }\n': typeof types.ReauthenticateDocument;
  '\n  query SecurityActivity {\n    securityActivity {\n      id\n      eventType\n      ipAddress\n      userAgent\n      createdAt\n    }\n  }\n': typeof types.SecurityActivityDocument;
  '\n  query Sessions {\n    sessions {\n      id\n      userAgent\n      ipAddress\n      deviceLabel\n      location\n      lastUsedAt\n      current\n    }\n  }\n': typeof types.SessionsDocument;
  '\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n': typeof types.RevokeSessionDocument;
  '\n  mutation RevokeOtherSessions {\n    revokeOtherSessions\n  }\n': typeof types.RevokeOtherSessionsDocument;
  '\n  query TotpEnabled {\n    totpEnabled\n  }\n': typeof types.TotpEnabledDocument;
  '\n  mutation BeginTotpSetup($password: String!) {\n    beginTotpSetup(password: $password) {\n      secret\n      otpauthUrl\n      qrCodeDataUrl\n    }\n  }\n': typeof types.BeginTotpSetupDocument;
  '\n  mutation ConfirmTotpSetup($code: String!) {\n    confirmTotpSetup(code: $code) {\n      backupCodes\n    }\n  }\n': typeof types.ConfirmTotpSetupDocument;
  '\n  mutation DisableTotp($password: String!) {\n    disableTotp(password: $password)\n  }\n': typeof types.DisableTotpDocument;
  '\n  mutation RegenerateTotpBackupCodes($currentPassword: String!) {\n    regenerateTotpBackupCodes(currentPassword: $currentPassword) {\n      backupCodes\n    }\n  }\n': typeof types.RegenerateTotpBackupCodesDocument;
  '\n  query LinkedOAuthAccounts {\n    linkedOAuthAccounts {\n      provider\n      email\n      createdAt\n    }\n  }\n': typeof types.LinkedOAuthAccountsDocument;
  '\n  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {\n    unlinkOAuthAccount(provider: $provider)\n  }\n': typeof types.UnlinkOAuthAccountDocument;
  '\n  query StepUpMethods {\n    me {\n      stepUpMethods\n    }\n  }\n': typeof types.StepUpMethodsDocument;
  '\n  mutation StartOAuthReauth($provider: OAuthProvider!) {\n    startOAuthReauth(provider: $provider)\n  }\n': typeof types.StartOAuthReauthDocument;
  '\n  mutation RequestStepUpCode {\n    requestStepUpCode\n  }\n': typeof types.RequestStepUpCodeDocument;
  '\n  mutation VerifyStepUpCode($code: String!) {\n    verifyStepUpCode(code: $code)\n  }\n': typeof types.VerifyStepUpCodeDocument;
};
const documents: Documents = {
  '\n  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n':
    types.UpdateApplicationDocument,
  '\n  mutation UpdateApplicationFlags($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n      starred\n      status\n    }\n  }\n':
    types.UpdateApplicationFlagsDocument,
  '\n  query ApplicationHealthScore($applicationId: ID!) {\n    applicationHealthScore(applicationId: $applicationId) {\n      score\n      label\n      criteria {\n        key\n        label\n        points\n        earned\n        met\n      }\n    }\n  }\n':
    types.ApplicationHealthScoreDocument,
  '\n  query ApplicationSectionCounts($id: ID!) {\n    application(id: $id) {\n      id\n      sectionCounts {\n        notes\n        interviews\n        contacts\n        offers\n        companyBriefing\n      }\n    }\n  }\n':
    types.ApplicationSectionCountsDocument,
  '\n  query ActivityLogs($applicationId: ID!) {\n    activityLogs(applicationId: $applicationId) {\n      id\n      eventType\n      payload\n      createdAt\n    }\n  }\n':
    types.ActivityLogsDocument,
  '\n  query CompanyBriefing($applicationId: ID!) {\n    companyBriefing(applicationId: $applicationId) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n':
    types.CompanyBriefingDocument,
  '\n  mutation GenerateCompanyBriefing($applicationId: ID!, $instructions: String) {\n    generateCompanyBriefing(applicationId: $applicationId, instructions: $instructions) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n':
    types.GenerateCompanyBriefingDocument,
  '\n  query Contacts($applicationId: ID!) {\n    contacts(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.ContactsDocument,
  '\n  mutation CreateContact(\n    $applicationId: ID!\n    $name: String!\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    createContact(\n      applicationId: $applicationId\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateContactDocument,
  '\n  mutation UpdateContact(\n    $id: ID!\n    $name: String\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    updateContact(\n      id: $id\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateContactDocument,
  '\n  mutation DeleteContact($id: ID!) {\n    deleteContact(id: $id)\n  }\n':
    types.DeleteContactDocument,
  '\n  query Application($id: ID!) {\n    application(id: $id) {\n      id\n      company\n      role\n      status\n      jobUrl\n      location\n      salaryRange\n      description\n      postingText\n      appliedAt\n      starred\n      source\n      followUpAt\n      tags\n      createdAt\n      updatedAt\n      deletedAt\n      purgeAt\n    }\n  }\n':
    types.ApplicationDocument,
  '\n  mutation BulkUpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n':
    types.BulkUpdateApplicationDocument,
  '\n  mutation CreateApplication($input: CreateApplicationInput!) {\n    createApplication(input: $input) {\n      id\n    }\n  }\n':
    types.CreateApplicationDocument,
  '\n  mutation ParseJobDescription($text: String, $url: String) {\n    parseJobDescription(text: $text, url: $url) {\n      company\n      role\n      location\n      salary\n      description\n      postingText\n    }\n  }\n':
    types.ParseJobDescriptionDocument,
  '\n  mutation DeleteApplication($id: ID!) {\n    deleteApplication(id: $id)\n  }\n':
    types.DeleteApplicationDocument,
  'query Applications($status: ApplicationStatus) {\n  applications(status: $status) {\n    id\n    company\n    role\n    status\n    jobUrl\n    location\n    salaryRange\n    appliedAt\n    starred\n    source\n    followUpAt\n    tags\n    createdAt\n    updatedAt\n  }\n}':
    types.ApplicationsDocument,
  '\n  query ApplicationsPage(\n    $status: ApplicationStatus\n    $starred: Boolean\n    $search: String\n    $cursor: String\n    $limit: Int\n    $likelyGhosted: Boolean\n  ) {\n    applicationsPage(\n      status: $status\n      starred: $starred\n      search: $search\n      cursor: $cursor\n      limit: $limit\n      likelyGhosted: $likelyGhosted\n    ) {\n      hasNextPage\n      nextCursor\n      items {\n        id\n        company\n        role\n        status\n        location\n        description\n        appliedAt\n        starred\n        source\n        followUpAt\n        tags\n        createdAt\n      }\n    }\n  }\n':
    types.ApplicationsPageDocument,
  '\n  query BoardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      starred\n      createdAt\n      tags\n      likelyGhosted\n      boardPosition\n    }\n  }\n':
    types.BoardApplicationsDocument,
  '\n  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {\n    moveApplicationOnBoard(input: $input) {\n      id\n      status\n      boardPosition\n    }\n  }\n':
    types.MoveApplicationOnBoardDocument,
  '\n  query TrashedApplications {\n    trashedApplications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      deletedAt\n      purgeAt\n    }\n  }\n':
    types.TrashedApplicationsDocument,
  '\n  mutation RestoreApplication($id: ID!) {\n    restoreApplication(id: $id)\n  }\n':
    types.RestoreApplicationDocument,
  '\n  mutation PermanentlyDeleteApplication($id: ID!) {\n    permanentlyDeleteApplication(id: $id)\n  }\n':
    types.PermanentlyDeleteApplicationDocument,
  '\n  mutation BulkRestoreApplications($ids: [ID!]!) {\n    bulkRestoreApplications(ids: $ids) {\n      restored\n    }\n  }\n':
    types.BulkRestoreApplicationsDocument,
  '\n  mutation EmptyTrash {\n    emptyTrash {\n      deleted\n      failed\n    }\n  }\n':
    types.EmptyTrashDocument,
  'mutation Register($email: String!, $password: String!, $captchaToken: String) {\n  register(email: $email, password: $password, captchaToken: $captchaToken)\n}\n\nmutation Login($email: String!, $password: String!, $captchaToken: String) {\n  login(email: $email, password: $password, captchaToken: $captchaToken) {\n    success\n    totpRequired\n    accessToken\n  }\n}\n\nmutation LoginWithTotp($email: String!, $password: String!, $code: String!) {\n  loginWithTotp(email: $email, password: $password, code: $code)\n}\n\nmutation RefreshToken {\n  refreshToken\n}\n\nmutation Logout {\n  logout\n}':
    types.RegisterDocument,
  '\n  query DashboardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      starred\n      followUpAt\n      createdAt\n    }\n  }\n':
    types.DashboardApplicationsDocument,
  '\n  query DashboardCalendarEvents {\n    calendarEvents {\n      id\n      applicationId\n      company\n      role\n      type\n      date\n      interviewRoundType\n    }\n  }\n':
    types.DashboardCalendarEventsDocument,
  '\n  query WeeklyApplicationGoal {\n    weeklyApplicationGoal {\n      weeklyApplicationGoal\n      currentWeekCount\n      currentWeekStart\n      streakWeeks\n    }\n  }\n':
    types.WeeklyApplicationGoalDocument,
  '\n  query OnboardingChecklist {\n    me {\n      onboardingChecklistDismissedAt\n      onboardingGoals\n      aiCredits {\n        used\n        limit\n        bonusRemaining\n      }\n    }\n    apiTokens {\n      id\n    }\n    llmApiKeys {\n      provider\n    }\n    workExperiences {\n      id\n    }\n  }\n':
    types.OnboardingChecklistDocument,
  '\n  mutation DismissOnboardingChecklist {\n    dismissOnboardingChecklist\n  }\n':
    types.DismissOnboardingChecklistDocument,
  '\n  mutation GenerateIntoDocumentDraft(\n    $draftId: ID!\n    $instructions: String\n    $resumeDocumentId: ID\n    $resumeDraftId: ID\n  ) {\n    generateIntoDocumentDraft(\n      draftId: $draftId\n      instructions: $instructions\n      resumeDocumentId: $resumeDocumentId\n      resumeDraftId: $resumeDraftId\n    ) {\n      contentJson\n      plainText\n    }\n  }\n':
    types.GenerateIntoDocumentDraftDocument,
  '\n  mutation ExtractDocumentText($documentId: ID!) {\n    extractDocumentText(documentId: $documentId) {\n      text\n    }\n  }\n':
    types.ExtractDocumentTextDocument,
  '\n  query Documents($applicationId: ID!) {\n    documents(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n':
    types.DocumentsDocument,
  '\n  query DocumentDrafts($applicationId: ID!) {\n    documentDrafts(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      title\n      plainText\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.DocumentDraftsDocument,
  '\n  mutation RequestUploadUrl($input: RequestUploadUrlInput!) {\n    requestUploadUrl(input: $input) {\n      uploadUrl\n      storageKey\n      access\n    }\n  }\n':
    types.RequestUploadUrlDocument,
  '\n  mutation ConfirmDocument($input: ConfirmDocumentInput!) {\n    confirmDocument(input: $input) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n':
    types.ConfirmDocumentDocument,
  '\n  mutation DeleteDocument($id: ID!) {\n    deleteDocument(id: $id)\n  }\n':
    types.DeleteDocumentDocument,
  '\n  query DocumentDraft($id: ID!) {\n    documentDraft(id: $id) {\n      id\n      applicationId\n      type\n      title\n      contentJson\n      plainText\n      sourceDocumentId\n      aiInstructions\n      aiGenerated\n      myRating {\n        rating\n        reason\n      }\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.DocumentDraftDocument,
  '\n  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {\n    updateDocumentDraftContent(input: $input) {\n      id\n      updatedAt\n    }\n  }\n':
    types.UpdateDocumentDraftContentDocument,
  '\n  mutation ExportDocumentDraftToPdf($draftId: ID!) {\n    exportDocumentDraftToPdf(draftId: $draftId) {\n      id\n      name\n      url\n    }\n  }\n':
    types.ExportDocumentDraftToPdfDocument,
  '\n  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {\n    renameDocumentDraft(draftId: $draftId, title: $title) {\n      id\n      title\n    }\n  }\n':
    types.RenameDocumentDraftDocument,
  '\n  mutation DeleteDocumentDraft($id: ID!) {\n    deleteDocumentDraft(id: $id)\n  }\n':
    types.DeleteDocumentDraftDocument,
  '\n  query DocumentDraftVersions($draftId: ID!) {\n    documentDraftVersions(draftId: $draftId) {\n      id\n      source\n      characterCount\n      createdAt\n    }\n  }\n':
    types.DocumentDraftVersionsDocument,
  '\n  query DocumentDraftVersion($id: ID!) {\n    documentDraftVersion(id: $id) {\n      id\n      source\n      plainText\n      createdAt\n    }\n  }\n':
    types.DocumentDraftVersionDocument,
  '\n  mutation CreateDocumentDraftVersion($draftId: ID!) {\n    createDocumentDraftVersion(draftId: $draftId) {\n      id\n      source\n    }\n  }\n':
    types.CreateDocumentDraftVersionDocument,
  '\n  mutation RestoreDocumentDraftVersion($versionId: ID!) {\n    restoreDocumentDraftVersion(versionId: $versionId) {\n      id\n      contentJson\n      plainText\n    }\n  }\n':
    types.RestoreDocumentDraftVersionDocument,
  '\n  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {\n    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {\n      markdown\n    }\n  }\n':
    types.PolishDocumentDraftDocument,
  '\n  query PostingRequirements($applicationId: ID!) {\n    postingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n':
    types.PostingRequirementsDocument,
  '\n  mutation ExtractPostingRequirements($applicationId: ID!) {\n    extractPostingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n':
    types.ExtractPostingRequirementsDocument,
  '\n  query ResumeAtsScores($applicationId: ID!) {\n    resumeAtsScores(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n':
    types.ResumeAtsScoresDocument,
  '\n  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {\n    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n':
    types.ComputeResumeAtsScoreDocument,
  '\n  query ResumeGaps($applicationId: ID!) {\n    resumeGaps(applicationId: $applicationId) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n':
    types.ResumeGapsDocument,
  '\n  mutation DismissResumeGap($applicationId: ID!, $key: String!) {\n    dismissResumeGap(applicationId: $applicationId, key: $key) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n':
    types.DismissResumeGapDocument,
  '\n  query ResumeMatches($applicationId: ID!) {\n    resumeMatches(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n':
    types.ResumeMatchesDocument,
  '\n  mutation ComputeResumeMatchScore($applicationId: ID!, $documentDraftId: ID, $documentId: ID) {\n    computeResumeMatchScore(\n      applicationId: $applicationId\n      documentDraftId: $documentDraftId\n      documentId: $documentId\n    ) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n':
    types.ComputeResumeMatchScoreDocument,
  '\n  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {\n    createDocumentDraft(input: $input) {\n      id\n      applicationId\n      type\n      title\n    }\n  }\n':
    types.CreateDocumentDraftDocument,
  '\n  query InterviewQuestions($interviewRoundId: ID!) {\n    interviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.InterviewQuestionsDocument,
  '\n  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {\n    createInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateInterviewQuestionDocument,
  '\n  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {\n    updateInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateInterviewQuestionDocument,
  '\n  mutation DeleteInterviewQuestion($id: ID!) {\n    deleteInterviewQuestion(id: $id)\n  }\n':
    types.DeleteInterviewQuestionDocument,
  '\n  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.ReorderInterviewQuestionsDocument,
  '\n  query InterviewRounds($applicationId: ID!) {\n    interviewRounds(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.InterviewRoundsDocument,
  '\n  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {\n    createInterviewRound(input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateInterviewRoundDocument,
  '\n  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {\n    updateInterviewRound(id: $id, input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateInterviewRoundDocument,
  '\n  mutation DeleteInterviewRound($id: ID!) {\n    deleteInterviewRound(id: $id)\n  }\n':
    types.DeleteInterviewRoundDocument,
  '\n  query MockInterviewQuestions($interviewRoundId: ID!) {\n    mockInterviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.MockInterviewQuestionsDocument,
  '\n  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {\n    createMockInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateMockInterviewQuestionDocument,
  '\n  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {\n    updateMockInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateMockInterviewQuestionDocument,
  '\n  mutation DeleteMockInterviewQuestion($id: ID!) {\n    deleteMockInterviewQuestion(id: $id)\n  }\n':
    types.DeleteMockInterviewQuestionDocument,
  '\n  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.ReorderMockInterviewQuestionsDocument,
  '\n  mutation GenerateMockInterviewQuestions(\n    $interviewRoundId: ID!\n    $prompt: String\n    $count: Int\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewQuestions(\n      interviewRoundId: $interviewRoundId\n      prompt: $prompt\n      count: $count\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      suggestions\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n':
    types.GenerateMockInterviewQuestionsDocument,
  '\n  mutation GenerateMockInterviewAnswer(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewAnswer(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      answer\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n':
    types.GenerateMockInterviewAnswerDocument,
  '\n  mutation GenerateMockTalkingPoints(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockTalkingPoints(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      nothingRelevant\n      usedProfile\n      usedDocument\n      question {\n        id\n        interviewRoundId\n        question\n        answer\n        answerSource\n        talkingPoints\n        talkingPointsGeneratedAt\n        position\n        createdAt\n        updatedAt\n      }\n    }\n  }\n':
    types.GenerateMockTalkingPointsDocument,
  'mutation CreateNote($applicationId: ID!, $content: String!) {\n  createNote(applicationId: $applicationId, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateNote($id: ID!, $content: String!) {\n  updateNote(id: $id, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}':
    types.CreateNoteDocument,
  'query Notes($applicationId: ID!) {\n  notes(applicationId: $applicationId) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}':
    types.NotesDocument,
  '\n  query Offers($applicationId: ID!) {\n    offers(applicationId: $applicationId) {\n      id\n      applicationId\n      baseSalary\n      bonus\n      equity\n      benefits\n      costOfLivingAdjustment\n      currency\n      period\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.OffersDocument,
  '\n  mutation CreateOffer($input: CreateOfferInput!) {\n    createOffer(input: $input) {\n      id\n    }\n  }\n':
    types.CreateOfferDocument,
  '\n  mutation UpdateOffer($input: UpdateOfferInput!) {\n    updateOffer(input: $input) {\n      id\n    }\n  }\n':
    types.UpdateOfferDocument,
  '\n  mutation DeleteOffer($id: String!) {\n    deleteOffer(id: $id)\n  }\n':
    types.DeleteOfferDocument,
  '\n  query MyOffers {\n    myOffers {\n      company\n      role\n      offer {\n        id\n        applicationId\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n        notes\n      }\n    }\n  }\n':
    types.MyOffersDocument,
  '\n  mutation CompareOffers($offerIds: [String!]!) {\n    compareOffers(offerIds: $offerIds) {\n      offer {\n        id\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n      }\n      company\n      role\n      normalizedYearlySalary\n      totalCompensation\n    }\n  }\n':
    types.CompareOffersDocument,
  '\n  query Awards {\n    awards {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n':
    types.AwardsDocument,
  '\n  mutation CreateAward($input: CreateAwardInput!) {\n    createAward(input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n':
    types.CreateAwardDocument,
  '\n  mutation UpdateAward($id: ID!, $input: UpdateAwardInput!) {\n    updateAward(id: $id, input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n':
    types.UpdateAwardDocument,
  '\n  mutation DeleteAward($id: ID!) {\n    deleteAward(id: $id)\n  }\n':
    types.DeleteAwardDocument,
  '\n  query Certifications {\n    certifications {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n':
    types.CertificationsDocument,
  '\n  mutation CreateCertification($input: CreateCertificationInput!) {\n    createCertification(input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n':
    types.CreateCertificationDocument,
  '\n  mutation UpdateCertification($id: ID!, $input: UpdateCertificationInput!) {\n    updateCertification(id: $id, input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n':
    types.UpdateCertificationDocument,
  '\n  mutation DeleteCertification($id: ID!) {\n    deleteCertification(id: $id)\n  }\n':
    types.DeleteCertificationDocument,
  '\n  mutation ImportCvProfile($input: ImportCvProfileInput!) {\n    importCvProfile(input: $input) {\n      workExperiences\n      educations\n      skills\n      certifications\n      languages\n      projects\n      awards\n    }\n  }\n':
    types.ImportCvProfileDocument,
  '\n  query CvImportSession {\n    me {\n      id\n    }\n  }\n': types.CvImportSessionDocument,
  '\n  query Educations {\n    educations {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.EducationsDocument,
  '\n  mutation CreateEducation($input: CreateEducationInput!) {\n    createEducation(input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateEducationDocument,
  '\n  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n    updateEducation(id: $id, input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateEducationDocument,
  '\n  mutation DeleteEducation($id: ID!) {\n    deleteEducation(id: $id)\n  }\n':
    types.DeleteEducationDocument,
  '\n  query Languages {\n    languages {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n':
    types.LanguagesDocument,
  '\n  mutation CreateLanguage($input: CreateLanguageInput!) {\n    createLanguage(input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n':
    types.CreateLanguageDocument,
  '\n  mutation UpdateLanguage($id: ID!, $input: UpdateLanguageInput!) {\n    updateLanguage(id: $id, input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n':
    types.UpdateLanguageDocument,
  '\n  mutation DeleteLanguage($id: ID!) {\n    deleteLanguage(id: $id)\n  }\n':
    types.DeleteLanguageDocument,
  '\n  query Projects {\n    projects {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n':
    types.ProjectsDocument,
  '\n  mutation CreateProject($input: CreateProjectInput!) {\n    createProject(input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n':
    types.CreateProjectDocument,
  '\n  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {\n    updateProject(id: $id, input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n':
    types.UpdateProjectDocument,
  '\n  mutation DeleteProject($id: ID!) {\n    deleteProject(id: $id)\n  }\n':
    types.DeleteProjectDocument,
  '\n  query Skills {\n    skills {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n':
    types.SkillsDocument,
  '\n  mutation CreateSkill($input: CreateSkillInput!) {\n    createSkill(input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n':
    types.CreateSkillDocument,
  '\n  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n    updateSkill(id: $id, input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n':
    types.UpdateSkillDocument,
  '\n  mutation DeleteSkill($id: ID!) {\n    deleteSkill(id: $id)\n  }\n':
    types.DeleteSkillDocument,
  '\n  query WorkExperiences {\n    workExperiences {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.WorkExperiencesDocument,
  '\n  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n    createWorkExperience(input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.CreateWorkExperienceDocument,
  '\n  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n    updateWorkExperience(id: $id, input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n':
    types.UpdateWorkExperienceDocument,
  '\n  mutation DeleteWorkExperience($id: ID!) {\n    deleteWorkExperience(id: $id)\n  }\n':
    types.DeleteWorkExperienceDocument,
  '\n  query Me {\n    me {\n      id\n      email\n      name\n      timezone\n      targetRole\n      phone\n      location\n      profileLinks\n      avatarUrl\n      backupEmail\n      backupEmailVerifiedAt\n      hasPassword\n    }\n  }\n':
    types.MeDocument,
  '\n  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {\n    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {\n      uploadUrl\n      storageKey\n    }\n  }\n':
    types.RequestAvatarUploadUrlDocument,
  '\n  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {\n    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)\n  }\n':
    types.ConfirmAvatarDocument,
  '\n  mutation RemoveAvatar {\n    removeAvatar\n  }\n': types.RemoveAvatarDocument,
  '\n  mutation UpdateProfile(\n    $name: String\n    $timezone: String\n    $targetRole: String\n    $phone: String\n    $location: String\n    $profileLinks: [String!]\n    $customAiPrompt: String\n    $useCrossApplicationContext: Boolean\n    $llmFallbackWhenLimited: Boolean\n  ) {\n    updateProfile(\n      name: $name\n      timezone: $timezone\n      targetRole: $targetRole\n      phone: $phone\n      location: $location\n      profileLinks: $profileLinks\n      customAiPrompt: $customAiPrompt\n      useCrossApplicationContext: $useCrossApplicationContext\n      llmFallbackWhenLimited: $llmFallbackWhenLimited\n    )\n  }\n':
    types.UpdateProfileDocument,
  '\n  query ExportUserData {\n    exportUserData\n  }\n': types.ExportUserDataDocument,
  '\n  mutation ImportUserData($data: String!) {\n    importUserData(data: $data) {\n      applicationsImported\n      applicationsSkipped\n      notesImported\n      documentsSkipped\n    }\n  }\n':
    types.ImportUserDataDocument,
  '\n  query NotificationPreferences {\n    notificationPreferences {\n      weeklyDigestEnabled\n      digestFrequency\n      followUpRemindersEnabled\n      pushNotificationsEnabled\n      weeklyApplicationGoal\n    }\n  }\n':
    types.NotificationPreferencesDocument,
  '\n  mutation UpdateNotificationPreferences(\n    $digestFrequency: DigestFrequency\n    $followUpRemindersEnabled: Boolean\n    $pushNotificationsEnabled: Boolean\n    $weeklyApplicationGoal: Int\n  ) {\n    updateNotificationPreferences(\n      digestFrequency: $digestFrequency\n      followUpRemindersEnabled: $followUpRemindersEnabled\n      pushNotificationsEnabled: $pushNotificationsEnabled\n      weeklyApplicationGoal: $weeklyApplicationGoal\n    )\n  }\n':
    types.UpdateNotificationPreferencesDocument,
  '\n  query StorageUsage {\n    me {\n      storageUsedBytes\n      storageLimitBytes\n    }\n  }\n':
    types.StorageUsageDocument,
  '\n  query LlmApiKeys {\n    llmApiKeys {\n      provider\n      model\n      baseUrl\n      monthlyTokenLimit\n    }\n    me {\n      aiProviderOrder\n      customAiPrompt\n      useCrossApplicationContext\n    }\n  }\n':
    types.LlmApiKeysDocument,
  '\n  mutation SetAiProviderOrder($order: [String!]!) {\n    setAiProviderOrder(order: $order)\n  }\n':
    types.SetAiProviderOrderDocument,
  '\n  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {\n    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)\n  }\n':
    types.SaveLlmApiKeyDocument,
  '\n  mutation DeleteLlmApiKey($provider: String!) {\n    deleteLlmApiKey(provider: $provider)\n  }\n':
    types.DeleteLlmApiKeyDocument,
  '\n  mutation SetLlmApiKeyMonthlyLimit($provider: String!, $monthlyTokenLimit: Int) {\n    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $monthlyTokenLimit)\n  }\n':
    types.SetLlmApiKeyMonthlyLimitDocument,
  '\n  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {\n    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {\n      ok\n      error\n    }\n  }\n':
    types.TestLlmApiKeyDocument,
  '\n  query LlmUsageSummary {\n    llmUsageSummary {\n      provider\n      requestCount\n      promptTokens\n      completionTokens\n      cacheReadTokens\n      cacheWriteTokens\n      lastUsedAt\n      monthlyTokenLimit\n      limitReached\n    }\n  }\n':
    types.LlmUsageSummaryDocument,
  '\n  query ApiTokens {\n    apiTokens {\n      id\n      name\n      scope\n      lastUsedAt\n      createdAt\n    }\n  }\n':
    types.ApiTokensDocument,
  '\n  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {\n    createApiToken(name: $name, scope: $scope) {\n      id\n      name\n      token\n      scope\n      createdAt\n    }\n  }\n':
    types.CreateApiTokenDocument,
  '\n  mutation DeleteApiToken($id: ID!) {\n    deleteApiToken(id: $id)\n  }\n':
    types.DeleteApiTokenDocument,
  '\n  query McpOAuthGrants {\n    mcpOAuthGrants {\n      id\n      clientName\n      scope\n      authorizedAt\n      lastUsedAt\n    }\n  }\n':
    types.McpOAuthGrantsDocument,
  '\n  mutation RevokeMcpOAuthGrant($id: ID!) {\n    revokeMcpOAuthGrant(id: $id)\n  }\n':
    types.RevokeMcpOAuthGrantDocument,
  '\n  query ShareLinks {\n    shareLinks {\n      id\n      name\n      lastUsedAt\n      createdAt\n    }\n  }\n':
    types.ShareLinksDocument,
  '\n  mutation CreateShareLink($name: String!) {\n    createShareLink(name: $name) {\n      id\n      name\n      token\n      createdAt\n    }\n  }\n':
    types.CreateShareLinkDocument,
  '\n  mutation DeleteShareLink($id: ID!) {\n    deleteShareLink(id: $id)\n  }\n':
    types.DeleteShareLinkDocument,
  '\n  mutation RequestEmailChange($currentPassword: String, $newEmail: String!) {\n    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)\n  }\n':
    types.RequestEmailChangeDocument,
  '\n  mutation RequestAddBackupEmail($currentPassword: String, $backupEmail: String!) {\n    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)\n  }\n':
    types.RequestAddBackupEmailDocument,
  '\n  mutation RemoveBackupEmail($currentPassword: String) {\n    removeBackupEmail(currentPassword: $currentPassword)\n  }\n':
    types.RemoveBackupEmailDocument,
  '\n  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {\n    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)\n  }\n':
    types.UpdatePasswordDocument,
  '\n  mutation Reauthenticate($password: String!, $code: String) {\n    reauthenticate(password: $password, code: $code) {\n      success\n      totpRequired\n      accessToken\n    }\n  }\n':
    types.ReauthenticateDocument,
  '\n  query SecurityActivity {\n    securityActivity {\n      id\n      eventType\n      ipAddress\n      userAgent\n      createdAt\n    }\n  }\n':
    types.SecurityActivityDocument,
  '\n  query Sessions {\n    sessions {\n      id\n      userAgent\n      ipAddress\n      deviceLabel\n      location\n      lastUsedAt\n      current\n    }\n  }\n':
    types.SessionsDocument,
  '\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n':
    types.RevokeSessionDocument,
  '\n  mutation RevokeOtherSessions {\n    revokeOtherSessions\n  }\n':
    types.RevokeOtherSessionsDocument,
  '\n  query TotpEnabled {\n    totpEnabled\n  }\n': types.TotpEnabledDocument,
  '\n  mutation BeginTotpSetup($password: String!) {\n    beginTotpSetup(password: $password) {\n      secret\n      otpauthUrl\n      qrCodeDataUrl\n    }\n  }\n':
    types.BeginTotpSetupDocument,
  '\n  mutation ConfirmTotpSetup($code: String!) {\n    confirmTotpSetup(code: $code) {\n      backupCodes\n    }\n  }\n':
    types.ConfirmTotpSetupDocument,
  '\n  mutation DisableTotp($password: String!) {\n    disableTotp(password: $password)\n  }\n':
    types.DisableTotpDocument,
  '\n  mutation RegenerateTotpBackupCodes($currentPassword: String!) {\n    regenerateTotpBackupCodes(currentPassword: $currentPassword) {\n      backupCodes\n    }\n  }\n':
    types.RegenerateTotpBackupCodesDocument,
  '\n  query LinkedOAuthAccounts {\n    linkedOAuthAccounts {\n      provider\n      email\n      createdAt\n    }\n  }\n':
    types.LinkedOAuthAccountsDocument,
  '\n  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {\n    unlinkOAuthAccount(provider: $provider)\n  }\n':
    types.UnlinkOAuthAccountDocument,
  '\n  query StepUpMethods {\n    me {\n      stepUpMethods\n    }\n  }\n':
    types.StepUpMethodsDocument,
  '\n  mutation StartOAuthReauth($provider: OAuthProvider!) {\n    startOAuthReauth(provider: $provider)\n  }\n':
    types.StartOAuthReauthDocument,
  '\n  mutation RequestStepUpCode {\n    requestStepUpCode\n  }\n': types.RequestStepUpCodeDocument,
  '\n  mutation VerifyStepUpCode($code: String!) {\n    verifyStepUpCode(code: $code)\n  }\n':
    types.VerifyStepUpCodeDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateApplicationFlags($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n      starred\n      status\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateApplicationFlags($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n      starred\n      status\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ApplicationHealthScore($applicationId: ID!) {\n    applicationHealthScore(applicationId: $applicationId) {\n      score\n      label\n      criteria {\n        key\n        label\n        points\n        earned\n        met\n      }\n    }\n  }\n',
): (typeof documents)['\n  query ApplicationHealthScore($applicationId: ID!) {\n    applicationHealthScore(applicationId: $applicationId) {\n      score\n      label\n      criteria {\n        key\n        label\n        points\n        earned\n        met\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ApplicationSectionCounts($id: ID!) {\n    application(id: $id) {\n      id\n      sectionCounts {\n        notes\n        interviews\n        contacts\n        offers\n        companyBriefing\n      }\n    }\n  }\n',
): (typeof documents)['\n  query ApplicationSectionCounts($id: ID!) {\n    application(id: $id) {\n      id\n      sectionCounts {\n        notes\n        interviews\n        contacts\n        offers\n        companyBriefing\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ActivityLogs($applicationId: ID!) {\n    activityLogs(applicationId: $applicationId) {\n      id\n      eventType\n      payload\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query ActivityLogs($applicationId: ID!) {\n    activityLogs(applicationId: $applicationId) {\n      id\n      eventType\n      payload\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CompanyBriefing($applicationId: ID!) {\n    companyBriefing(applicationId: $applicationId) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n',
): (typeof documents)['\n  query CompanyBriefing($applicationId: ID!) {\n    companyBriefing(applicationId: $applicationId) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation GenerateCompanyBriefing($applicationId: ID!, $instructions: String) {\n    generateCompanyBriefing(applicationId: $applicationId, instructions: $instructions) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation GenerateCompanyBriefing($applicationId: ID!, $instructions: String) {\n    generateCompanyBriefing(applicationId: $applicationId, instructions: $instructions) {\n      id\n      applicationId\n      content\n      sources {\n        url\n        title\n        publishedAt\n      }\n      generatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Contacts($applicationId: ID!) {\n    contacts(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query Contacts($applicationId: ID!) {\n    contacts(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateContact(\n    $applicationId: ID!\n    $name: String!\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    createContact(\n      applicationId: $applicationId\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateContact(\n    $applicationId: ID!\n    $name: String!\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    createContact(\n      applicationId: $applicationId\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateContact(\n    $id: ID!\n    $name: String\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    updateContact(\n      id: $id\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateContact(\n    $id: ID!\n    $name: String\n    $role: String\n    $email: String\n    $phone: String\n    $linkedinUrl: String\n    $notes: String\n  ) {\n    updateContact(\n      id: $id\n      name: $name\n      role: $role\n      email: $email\n      phone: $phone\n      linkedinUrl: $linkedinUrl\n      notes: $notes\n    ) {\n      id\n      applicationId\n      name\n      role\n      email\n      phone\n      linkedinUrl\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteContact($id: ID!) {\n    deleteContact(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteContact($id: ID!) {\n    deleteContact(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Application($id: ID!) {\n    application(id: $id) {\n      id\n      company\n      role\n      status\n      jobUrl\n      location\n      salaryRange\n      description\n      postingText\n      appliedAt\n      starred\n      source\n      followUpAt\n      tags\n      createdAt\n      updatedAt\n      deletedAt\n      purgeAt\n    }\n  }\n',
): (typeof documents)['\n  query Application($id: ID!) {\n    application(id: $id) {\n      id\n      company\n      role\n      status\n      jobUrl\n      location\n      salaryRange\n      description\n      postingText\n      appliedAt\n      starred\n      source\n      followUpAt\n      tags\n      createdAt\n      updatedAt\n      deletedAt\n      purgeAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation BulkUpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n',
): (typeof documents)['\n  mutation BulkUpdateApplication($id: ID!, $input: UpdateApplicationInput!) {\n    updateApplication(id: $id, input: $input) {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateApplication($input: CreateApplicationInput!) {\n    createApplication(input: $input) {\n      id\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateApplication($input: CreateApplicationInput!) {\n    createApplication(input: $input) {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ParseJobDescription($text: String, $url: String) {\n    parseJobDescription(text: $text, url: $url) {\n      company\n      role\n      location\n      salary\n      description\n      postingText\n    }\n  }\n',
): (typeof documents)['\n  mutation ParseJobDescription($text: String, $url: String) {\n    parseJobDescription(text: $text, url: $url) {\n      company\n      role\n      location\n      salary\n      description\n      postingText\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteApplication($id: ID!) {\n    deleteApplication(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteApplication($id: ID!) {\n    deleteApplication(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query Applications($status: ApplicationStatus) {\n  applications(status: $status) {\n    id\n    company\n    role\n    status\n    jobUrl\n    location\n    salaryRange\n    appliedAt\n    starred\n    source\n    followUpAt\n    tags\n    createdAt\n    updatedAt\n  }\n}',
): (typeof documents)['query Applications($status: ApplicationStatus) {\n  applications(status: $status) {\n    id\n    company\n    role\n    status\n    jobUrl\n    location\n    salaryRange\n    appliedAt\n    starred\n    source\n    followUpAt\n    tags\n    createdAt\n    updatedAt\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ApplicationsPage(\n    $status: ApplicationStatus\n    $starred: Boolean\n    $search: String\n    $cursor: String\n    $limit: Int\n    $likelyGhosted: Boolean\n  ) {\n    applicationsPage(\n      status: $status\n      starred: $starred\n      search: $search\n      cursor: $cursor\n      limit: $limit\n      likelyGhosted: $likelyGhosted\n    ) {\n      hasNextPage\n      nextCursor\n      items {\n        id\n        company\n        role\n        status\n        location\n        description\n        appliedAt\n        starred\n        source\n        followUpAt\n        tags\n        createdAt\n      }\n    }\n  }\n',
): (typeof documents)['\n  query ApplicationsPage(\n    $status: ApplicationStatus\n    $starred: Boolean\n    $search: String\n    $cursor: String\n    $limit: Int\n    $likelyGhosted: Boolean\n  ) {\n    applicationsPage(\n      status: $status\n      starred: $starred\n      search: $search\n      cursor: $cursor\n      limit: $limit\n      likelyGhosted: $likelyGhosted\n    ) {\n      hasNextPage\n      nextCursor\n      items {\n        id\n        company\n        role\n        status\n        location\n        description\n        appliedAt\n        starred\n        source\n        followUpAt\n        tags\n        createdAt\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query BoardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      starred\n      createdAt\n      tags\n      likelyGhosted\n      boardPosition\n    }\n  }\n',
): (typeof documents)['\n  query BoardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      starred\n      createdAt\n      tags\n      likelyGhosted\n      boardPosition\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {\n    moveApplicationOnBoard(input: $input) {\n      id\n      status\n      boardPosition\n    }\n  }\n',
): (typeof documents)['\n  mutation MoveApplicationOnBoard($input: MoveApplicationOnBoardInput!) {\n    moveApplicationOnBoard(input: $input) {\n      id\n      status\n      boardPosition\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query TrashedApplications {\n    trashedApplications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      deletedAt\n      purgeAt\n    }\n  }\n',
): (typeof documents)['\n  query TrashedApplications {\n    trashedApplications {\n      id\n      company\n      role\n      status\n      location\n      appliedAt\n      deletedAt\n      purgeAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RestoreApplication($id: ID!) {\n    restoreApplication(id: $id)\n  }\n',
): (typeof documents)['\n  mutation RestoreApplication($id: ID!) {\n    restoreApplication(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation PermanentlyDeleteApplication($id: ID!) {\n    permanentlyDeleteApplication(id: $id)\n  }\n',
): (typeof documents)['\n  mutation PermanentlyDeleteApplication($id: ID!) {\n    permanentlyDeleteApplication(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation BulkRestoreApplications($ids: [ID!]!) {\n    bulkRestoreApplications(ids: $ids) {\n      restored\n    }\n  }\n',
): (typeof documents)['\n  mutation BulkRestoreApplications($ids: [ID!]!) {\n    bulkRestoreApplications(ids: $ids) {\n      restored\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation EmptyTrash {\n    emptyTrash {\n      deleted\n      failed\n    }\n  }\n',
): (typeof documents)['\n  mutation EmptyTrash {\n    emptyTrash {\n      deleted\n      failed\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'mutation Register($email: String!, $password: String!, $captchaToken: String) {\n  register(email: $email, password: $password, captchaToken: $captchaToken)\n}\n\nmutation Login($email: String!, $password: String!, $captchaToken: String) {\n  login(email: $email, password: $password, captchaToken: $captchaToken) {\n    success\n    totpRequired\n    accessToken\n  }\n}\n\nmutation LoginWithTotp($email: String!, $password: String!, $code: String!) {\n  loginWithTotp(email: $email, password: $password, code: $code)\n}\n\nmutation RefreshToken {\n  refreshToken\n}\n\nmutation Logout {\n  logout\n}',
): (typeof documents)['mutation Register($email: String!, $password: String!, $captchaToken: String) {\n  register(email: $email, password: $password, captchaToken: $captchaToken)\n}\n\nmutation Login($email: String!, $password: String!, $captchaToken: String) {\n  login(email: $email, password: $password, captchaToken: $captchaToken) {\n    success\n    totpRequired\n    accessToken\n  }\n}\n\nmutation LoginWithTotp($email: String!, $password: String!, $code: String!) {\n  loginWithTotp(email: $email, password: $password, code: $code)\n}\n\nmutation RefreshToken {\n  refreshToken\n}\n\nmutation Logout {\n  logout\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query DashboardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      starred\n      followUpAt\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query DashboardApplications {\n    applications {\n      id\n      company\n      role\n      status\n      starred\n      followUpAt\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query DashboardCalendarEvents {\n    calendarEvents {\n      id\n      applicationId\n      company\n      role\n      type\n      date\n      interviewRoundType\n    }\n  }\n',
): (typeof documents)['\n  query DashboardCalendarEvents {\n    calendarEvents {\n      id\n      applicationId\n      company\n      role\n      type\n      date\n      interviewRoundType\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query WeeklyApplicationGoal {\n    weeklyApplicationGoal {\n      weeklyApplicationGoal\n      currentWeekCount\n      currentWeekStart\n      streakWeeks\n    }\n  }\n',
): (typeof documents)['\n  query WeeklyApplicationGoal {\n    weeklyApplicationGoal {\n      weeklyApplicationGoal\n      currentWeekCount\n      currentWeekStart\n      streakWeeks\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query OnboardingChecklist {\n    me {\n      onboardingChecklistDismissedAt\n      onboardingGoals\n      aiCredits {\n        used\n        limit\n        bonusRemaining\n      }\n    }\n    apiTokens {\n      id\n    }\n    llmApiKeys {\n      provider\n    }\n    workExperiences {\n      id\n    }\n  }\n',
): (typeof documents)['\n  query OnboardingChecklist {\n    me {\n      onboardingChecklistDismissedAt\n      onboardingGoals\n      aiCredits {\n        used\n        limit\n        bonusRemaining\n      }\n    }\n    apiTokens {\n      id\n    }\n    llmApiKeys {\n      provider\n    }\n    workExperiences {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DismissOnboardingChecklist {\n    dismissOnboardingChecklist\n  }\n',
): (typeof documents)['\n  mutation DismissOnboardingChecklist {\n    dismissOnboardingChecklist\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation GenerateIntoDocumentDraft(\n    $draftId: ID!\n    $instructions: String\n    $resumeDocumentId: ID\n    $resumeDraftId: ID\n  ) {\n    generateIntoDocumentDraft(\n      draftId: $draftId\n      instructions: $instructions\n      resumeDocumentId: $resumeDocumentId\n      resumeDraftId: $resumeDraftId\n    ) {\n      contentJson\n      plainText\n    }\n  }\n',
): (typeof documents)['\n  mutation GenerateIntoDocumentDraft(\n    $draftId: ID!\n    $instructions: String\n    $resumeDocumentId: ID\n    $resumeDraftId: ID\n  ) {\n    generateIntoDocumentDraft(\n      draftId: $draftId\n      instructions: $instructions\n      resumeDocumentId: $resumeDocumentId\n      resumeDraftId: $resumeDraftId\n    ) {\n      contentJson\n      plainText\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ExtractDocumentText($documentId: ID!) {\n    extractDocumentText(documentId: $documentId) {\n      text\n    }\n  }\n',
): (typeof documents)['\n  mutation ExtractDocumentText($documentId: ID!) {\n    extractDocumentText(documentId: $documentId) {\n      text\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Documents($applicationId: ID!) {\n    documents(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query Documents($applicationId: ID!) {\n    documents(applicationId: $applicationId) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query DocumentDrafts($applicationId: ID!) {\n    documentDrafts(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      title\n      plainText\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query DocumentDrafts($applicationId: ID!) {\n    documentDrafts(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      title\n      plainText\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestUploadUrl($input: RequestUploadUrlInput!) {\n    requestUploadUrl(input: $input) {\n      uploadUrl\n      storageKey\n      access\n    }\n  }\n',
): (typeof documents)['\n  mutation RequestUploadUrl($input: RequestUploadUrlInput!) {\n    requestUploadUrl(input: $input) {\n      uploadUrl\n      storageKey\n      access\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ConfirmDocument($input: ConfirmDocumentInput!) {\n    confirmDocument(input: $input) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation ConfirmDocument($input: ConfirmDocumentInput!) {\n    confirmDocument(input: $input) {\n      id\n      applicationId\n      name\n      mimeType\n      sizeBytes\n      url\n      documentType\n      version\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteDocument($id: ID!) {\n    deleteDocument(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteDocument($id: ID!) {\n    deleteDocument(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query DocumentDraft($id: ID!) {\n    documentDraft(id: $id) {\n      id\n      applicationId\n      type\n      title\n      contentJson\n      plainText\n      sourceDocumentId\n      aiInstructions\n      aiGenerated\n      myRating {\n        rating\n        reason\n      }\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query DocumentDraft($id: ID!) {\n    documentDraft(id: $id) {\n      id\n      applicationId\n      type\n      title\n      contentJson\n      plainText\n      sourceDocumentId\n      aiInstructions\n      aiGenerated\n      myRating {\n        rating\n        reason\n      }\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {\n    updateDocumentDraftContent(input: $input) {\n      id\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateDocumentDraftContent($input: UpdateDocumentDraftContentInput!) {\n    updateDocumentDraftContent(input: $input) {\n      id\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ExportDocumentDraftToPdf($draftId: ID!) {\n    exportDocumentDraftToPdf(draftId: $draftId) {\n      id\n      name\n      url\n    }\n  }\n',
): (typeof documents)['\n  mutation ExportDocumentDraftToPdf($draftId: ID!) {\n    exportDocumentDraftToPdf(draftId: $draftId) {\n      id\n      name\n      url\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {\n    renameDocumentDraft(draftId: $draftId, title: $title) {\n      id\n      title\n    }\n  }\n',
): (typeof documents)['\n  mutation RenameDocumentDraft($draftId: ID!, $title: String!) {\n    renameDocumentDraft(draftId: $draftId, title: $title) {\n      id\n      title\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteDocumentDraft($id: ID!) {\n    deleteDocumentDraft(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteDocumentDraft($id: ID!) {\n    deleteDocumentDraft(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query DocumentDraftVersions($draftId: ID!) {\n    documentDraftVersions(draftId: $draftId) {\n      id\n      source\n      characterCount\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query DocumentDraftVersions($draftId: ID!) {\n    documentDraftVersions(draftId: $draftId) {\n      id\n      source\n      characterCount\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query DocumentDraftVersion($id: ID!) {\n    documentDraftVersion(id: $id) {\n      id\n      source\n      plainText\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query DocumentDraftVersion($id: ID!) {\n    documentDraftVersion(id: $id) {\n      id\n      source\n      plainText\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateDocumentDraftVersion($draftId: ID!) {\n    createDocumentDraftVersion(draftId: $draftId) {\n      id\n      source\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateDocumentDraftVersion($draftId: ID!) {\n    createDocumentDraftVersion(draftId: $draftId) {\n      id\n      source\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RestoreDocumentDraftVersion($versionId: ID!) {\n    restoreDocumentDraftVersion(versionId: $versionId) {\n      id\n      contentJson\n      plainText\n    }\n  }\n',
): (typeof documents)['\n  mutation RestoreDocumentDraftVersion($versionId: ID!) {\n    restoreDocumentDraftVersion(versionId: $versionId) {\n      id\n      contentJson\n      plainText\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {\n    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {\n      markdown\n    }\n  }\n',
): (typeof documents)['\n  mutation PolishDocumentDraft($draftId: ID!, $plainText: String!, $instructions: String) {\n    polishDocumentDraft(draftId: $draftId, plainText: $plainText, instructions: $instructions) {\n      markdown\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query PostingRequirements($applicationId: ID!) {\n    postingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n',
): (typeof documents)['\n  query PostingRequirements($applicationId: ID!) {\n    postingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ExtractPostingRequirements($applicationId: ID!) {\n    extractPostingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n',
): (typeof documents)['\n  mutation ExtractPostingRequirements($applicationId: ID!) {\n    extractPostingRequirements(applicationId: $applicationId) {\n      id\n      applicationId\n      mustHave\n      niceToHave\n      keywords\n      seniority\n      generatedAt\n      isStale\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ResumeAtsScores($applicationId: ID!) {\n    resumeAtsScores(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n',
): (typeof documents)['\n  query ResumeAtsScores($applicationId: ID!) {\n    resumeAtsScores(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {\n    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n',
): (typeof documents)['\n  mutation ComputeResumeAtsScore($documentDraftId: ID, $documentId: ID) {\n    computeResumeAtsScore(documentDraftId: $documentDraftId, documentId: $documentId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      readable\n      checks {\n        id\n        label\n        passed\n        points\n        maxPoints\n        hint\n      }\n      generatedAt\n      isStale\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ResumeGaps($applicationId: ID!) {\n    resumeGaps(applicationId: $applicationId) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n',
): (typeof documents)['\n  query ResumeGaps($applicationId: ID!) {\n    resumeGaps(applicationId: $applicationId) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DismissResumeGap($applicationId: ID!, $key: String!) {\n    dismissResumeGap(applicationId: $applicationId, key: $key) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation DismissResumeGap($applicationId: ID!, $key: String!) {\n    dismissResumeGap(applicationId: $applicationId, key: $key) {\n      requirementsRead\n      requirementGaps\n      rolesWithoutMetrics {\n        workExperienceId\n        company\n        title\n        description\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ResumeMatches($applicationId: ID!) {\n    resumeMatches(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n',
): (typeof documents)['\n  query ResumeMatches($applicationId: ID!) {\n    resumeMatches(applicationId: $applicationId) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ComputeResumeMatchScore($applicationId: ID!, $documentDraftId: ID, $documentId: ID) {\n    computeResumeMatchScore(\n      applicationId: $applicationId\n      documentDraftId: $documentDraftId\n      documentId: $documentId\n    ) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n',
): (typeof documents)['\n  mutation ComputeResumeMatchScore($applicationId: ID!, $documentDraftId: ID, $documentId: ID) {\n    computeResumeMatchScore(\n      applicationId: $applicationId\n      documentDraftId: $documentDraftId\n      documentId: $documentId\n    ) {\n      id\n      applicationId\n      documentDraftId\n      documentId\n      score\n      label\n      matchedKeywords\n      missingKeywords\n      summary\n      generatedAt\n      isStale\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {\n    createDocumentDraft(input: $input) {\n      id\n      applicationId\n      type\n      title\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {\n    createDocumentDraft(input: $input) {\n      id\n      applicationId\n      type\n      title\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query InterviewQuestions($interviewRoundId: ID!) {\n    interviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query InterviewQuestions($interviewRoundId: ID!) {\n    interviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {\n    createInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateInterviewQuestion($input: CreateInterviewQuestionInput!) {\n    createInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {\n    updateInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateInterviewQuestion($id: ID!, $input: UpdateInterviewQuestionInput!) {\n    updateInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteInterviewQuestion($id: ID!) {\n    deleteInterviewQuestion(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteInterviewQuestion($id: ID!) {\n    deleteInterviewQuestion(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation ReorderInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query InterviewRounds($applicationId: ID!) {\n    interviewRounds(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query InterviewRounds($applicationId: ID!) {\n    interviewRounds(applicationId: $applicationId) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {\n    createInterviewRound(input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateInterviewRound($input: CreateInterviewRoundInput!) {\n    createInterviewRound(input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {\n    updateInterviewRound(id: $id, input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateInterviewRound($id: ID!, $input: UpdateInterviewRoundInput!) {\n    updateInterviewRound(id: $id, input: $input) {\n      id\n      applicationId\n      type\n      scheduledAt\n      completedAt\n      interviewerName\n      notes\n      outcome\n      questionCount\n      mockQuestionCount\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteInterviewRound($id: ID!) {\n    deleteInterviewRound(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteInterviewRound($id: ID!) {\n    deleteInterviewRound(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query MockInterviewQuestions($interviewRoundId: ID!) {\n    mockInterviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query MockInterviewQuestions($interviewRoundId: ID!) {\n    mockInterviewQuestions(interviewRoundId: $interviewRoundId) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {\n    createMockInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateMockInterviewQuestion($input: CreateMockInterviewQuestionInput!) {\n    createMockInterviewQuestion(input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {\n    updateMockInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateMockInterviewQuestion($id: ID!, $input: UpdateMockInterviewQuestionInput!) {\n    updateMockInterviewQuestion(id: $id, input: $input) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteMockInterviewQuestion($id: ID!) {\n    deleteMockInterviewQuestion(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteMockInterviewQuestion($id: ID!) {\n    deleteMockInterviewQuestion(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation ReorderMockInterviewQuestions($interviewRoundId: ID!, $orderedIds: [ID!]!) {\n    reorderMockInterviewQuestions(interviewRoundId: $interviewRoundId, orderedIds: $orderedIds) {\n      id\n      interviewRoundId\n      question\n      answer\n      answerSource\n      talkingPoints\n      talkingPointsGeneratedAt\n      position\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation GenerateMockInterviewQuestions(\n    $interviewRoundId: ID!\n    $prompt: String\n    $count: Int\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewQuestions(\n      interviewRoundId: $interviewRoundId\n      prompt: $prompt\n      count: $count\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      suggestions\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n',
): (typeof documents)['\n  mutation GenerateMockInterviewQuestions(\n    $interviewRoundId: ID!\n    $prompt: String\n    $count: Int\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewQuestions(\n      interviewRoundId: $interviewRoundId\n      prompt: $prompt\n      count: $count\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      suggestions\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation GenerateMockInterviewAnswer(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewAnswer(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      answer\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n',
): (typeof documents)['\n  mutation GenerateMockInterviewAnswer(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockInterviewAnswer(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      answer\n      usedJobDescription\n      usedBriefing\n      usedProfile\n      usedDocument\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation GenerateMockTalkingPoints(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockTalkingPoints(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      nothingRelevant\n      usedProfile\n      usedDocument\n      question {\n        id\n        interviewRoundId\n        question\n        answer\n        answerSource\n        talkingPoints\n        talkingPointsGeneratedAt\n        position\n        createdAt\n        updatedAt\n      }\n    }\n  }\n',
): (typeof documents)['\n  mutation GenerateMockTalkingPoints(\n    $mockInterviewQuestionId: ID!\n    $prompt: String\n    $useProfile: Boolean\n    $documentId: ID\n  ) {\n    generateMockTalkingPoints(\n      mockInterviewQuestionId: $mockInterviewQuestionId\n      prompt: $prompt\n      useProfile: $useProfile\n      documentId: $documentId\n    ) {\n      nothingRelevant\n      usedProfile\n      usedDocument\n      question {\n        id\n        interviewRoundId\n        question\n        answer\n        answerSource\n        talkingPoints\n        talkingPointsGeneratedAt\n        position\n        createdAt\n        updatedAt\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'mutation CreateNote($applicationId: ID!, $content: String!) {\n  createNote(applicationId: $applicationId, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateNote($id: ID!, $content: String!) {\n  updateNote(id: $id, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}',
): (typeof documents)['mutation CreateNote($applicationId: ID!, $content: String!) {\n  createNote(applicationId: $applicationId, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateNote($id: ID!, $content: String!) {\n  updateNote(id: $id, content: $content) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteNote($id: ID!) {\n  deleteNote(id: $id)\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query Notes($applicationId: ID!) {\n  notes(applicationId: $applicationId) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}',
): (typeof documents)['query Notes($applicationId: ID!) {\n  notes(applicationId: $applicationId) {\n    id\n    applicationId\n    content\n    createdAt\n    updatedAt\n  }\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Offers($applicationId: ID!) {\n    offers(applicationId: $applicationId) {\n      id\n      applicationId\n      baseSalary\n      bonus\n      equity\n      benefits\n      costOfLivingAdjustment\n      currency\n      period\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query Offers($applicationId: ID!) {\n    offers(applicationId: $applicationId) {\n      id\n      applicationId\n      baseSalary\n      bonus\n      equity\n      benefits\n      costOfLivingAdjustment\n      currency\n      period\n      notes\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateOffer($input: CreateOfferInput!) {\n    createOffer(input: $input) {\n      id\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateOffer($input: CreateOfferInput!) {\n    createOffer(input: $input) {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateOffer($input: UpdateOfferInput!) {\n    updateOffer(input: $input) {\n      id\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateOffer($input: UpdateOfferInput!) {\n    updateOffer(input: $input) {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteOffer($id: String!) {\n    deleteOffer(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteOffer($id: String!) {\n    deleteOffer(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query MyOffers {\n    myOffers {\n      company\n      role\n      offer {\n        id\n        applicationId\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n        notes\n      }\n    }\n  }\n',
): (typeof documents)['\n  query MyOffers {\n    myOffers {\n      company\n      role\n      offer {\n        id\n        applicationId\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n        notes\n      }\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CompareOffers($offerIds: [String!]!) {\n    compareOffers(offerIds: $offerIds) {\n      offer {\n        id\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n      }\n      company\n      role\n      normalizedYearlySalary\n      totalCompensation\n    }\n  }\n',
): (typeof documents)['\n  mutation CompareOffers($offerIds: [String!]!) {\n    compareOffers(offerIds: $offerIds) {\n      offer {\n        id\n        baseSalary\n        bonus\n        equity\n        benefits\n        costOfLivingAdjustment\n        currency\n        period\n      }\n      company\n      role\n      normalizedYearlySalary\n      totalCompensation\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Awards {\n    awards {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query Awards {\n    awards {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateAward($input: CreateAwardInput!) {\n    createAward(input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateAward($input: CreateAwardInput!) {\n    createAward(input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateAward($id: ID!, $input: UpdateAwardInput!) {\n    updateAward(id: $id, input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateAward($id: ID!, $input: UpdateAwardInput!) {\n    updateAward(id: $id, input: $input) {\n      id\n      title\n      issuer\n      date\n      description\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteAward($id: ID!) {\n    deleteAward(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteAward($id: ID!) {\n    deleteAward(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Certifications {\n    certifications {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query Certifications {\n    certifications {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateCertification($input: CreateCertificationInput!) {\n    createCertification(input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateCertification($input: CreateCertificationInput!) {\n    createCertification(input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateCertification($id: ID!, $input: UpdateCertificationInput!) {\n    updateCertification(id: $id, input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateCertification($id: ID!, $input: UpdateCertificationInput!) {\n    updateCertification(id: $id, input: $input) {\n      id\n      name\n      issuer\n      issuedAt\n      expiresAt\n      credentialUrl\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteCertification($id: ID!) {\n    deleteCertification(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteCertification($id: ID!) {\n    deleteCertification(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ImportCvProfile($input: ImportCvProfileInput!) {\n    importCvProfile(input: $input) {\n      workExperiences\n      educations\n      skills\n      certifications\n      languages\n      projects\n      awards\n    }\n  }\n',
): (typeof documents)['\n  mutation ImportCvProfile($input: ImportCvProfileInput!) {\n    importCvProfile(input: $input) {\n      workExperiences\n      educations\n      skills\n      certifications\n      languages\n      projects\n      awards\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query CvImportSession {\n    me {\n      id\n    }\n  }\n',
): (typeof documents)['\n  query CvImportSession {\n    me {\n      id\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Educations {\n    educations {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query Educations {\n    educations {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateEducation($input: CreateEducationInput!) {\n    createEducation(input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateEducation($input: CreateEducationInput!) {\n    createEducation(input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n    updateEducation(id: $id, input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n    updateEducation(id: $id, input: $input) {\n      id\n      institution\n      degree\n      field\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteEducation($id: ID!) {\n    deleteEducation(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteEducation($id: ID!) {\n    deleteEducation(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Languages {\n    languages {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query Languages {\n    languages {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateLanguage($input: CreateLanguageInput!) {\n    createLanguage(input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateLanguage($input: CreateLanguageInput!) {\n    createLanguage(input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateLanguage($id: ID!, $input: UpdateLanguageInput!) {\n    updateLanguage(id: $id, input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateLanguage($id: ID!, $input: UpdateLanguageInput!) {\n    updateLanguage(id: $id, input: $input) {\n      id\n      name\n      proficiency\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteLanguage($id: ID!) {\n    deleteLanguage(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteLanguage($id: ID!) {\n    deleteLanguage(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Projects {\n    projects {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query Projects {\n    projects {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateProject($input: CreateProjectInput!) {\n    createProject(input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateProject($input: CreateProjectInput!) {\n    createProject(input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {\n    updateProject(id: $id, input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {\n    updateProject(id: $id, input: $input) {\n      id\n      name\n      role\n      url\n      startDate\n      endDate\n      description\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteProject($id: ID!) {\n    deleteProject(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteProject($id: ID!) {\n    deleteProject(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Skills {\n    skills {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query Skills {\n    skills {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateSkill($input: CreateSkillInput!) {\n    createSkill(input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateSkill($input: CreateSkillInput!) {\n    createSkill(input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n    updateSkill(id: $id, input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n    updateSkill(id: $id, input: $input) {\n      id\n      name\n      category\n      proficiency\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteSkill($id: ID!) {\n    deleteSkill(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteSkill($id: ID!) {\n    deleteSkill(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query WorkExperiences {\n    workExperiences {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  query WorkExperiences {\n    workExperiences {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n    createWorkExperience(input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n    createWorkExperience(input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n    updateWorkExperience(id: $id, input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n',
): (typeof documents)['\n  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n    updateWorkExperience(id: $id, input: $input) {\n      id\n      company\n      title\n      location\n      startDate\n      endDate\n      description\n      createdAt\n      updatedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteWorkExperience($id: ID!) {\n    deleteWorkExperience(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteWorkExperience($id: ID!) {\n    deleteWorkExperience(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Me {\n    me {\n      id\n      email\n      name\n      timezone\n      targetRole\n      phone\n      location\n      profileLinks\n      avatarUrl\n      backupEmail\n      backupEmailVerifiedAt\n      hasPassword\n    }\n  }\n',
): (typeof documents)['\n  query Me {\n    me {\n      id\n      email\n      name\n      timezone\n      targetRole\n      phone\n      location\n      profileLinks\n      avatarUrl\n      backupEmail\n      backupEmailVerifiedAt\n      hasPassword\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {\n    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {\n      uploadUrl\n      storageKey\n    }\n  }\n',
): (typeof documents)['\n  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {\n    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {\n      uploadUrl\n      storageKey\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {\n    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)\n  }\n',
): (typeof documents)['\n  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {\n    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RemoveAvatar {\n    removeAvatar\n  }\n',
): (typeof documents)['\n  mutation RemoveAvatar {\n    removeAvatar\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateProfile(\n    $name: String\n    $timezone: String\n    $targetRole: String\n    $phone: String\n    $location: String\n    $profileLinks: [String!]\n    $customAiPrompt: String\n    $useCrossApplicationContext: Boolean\n    $llmFallbackWhenLimited: Boolean\n  ) {\n    updateProfile(\n      name: $name\n      timezone: $timezone\n      targetRole: $targetRole\n      phone: $phone\n      location: $location\n      profileLinks: $profileLinks\n      customAiPrompt: $customAiPrompt\n      useCrossApplicationContext: $useCrossApplicationContext\n      llmFallbackWhenLimited: $llmFallbackWhenLimited\n    )\n  }\n',
): (typeof documents)['\n  mutation UpdateProfile(\n    $name: String\n    $timezone: String\n    $targetRole: String\n    $phone: String\n    $location: String\n    $profileLinks: [String!]\n    $customAiPrompt: String\n    $useCrossApplicationContext: Boolean\n    $llmFallbackWhenLimited: Boolean\n  ) {\n    updateProfile(\n      name: $name\n      timezone: $timezone\n      targetRole: $targetRole\n      phone: $phone\n      location: $location\n      profileLinks: $profileLinks\n      customAiPrompt: $customAiPrompt\n      useCrossApplicationContext: $useCrossApplicationContext\n      llmFallbackWhenLimited: $llmFallbackWhenLimited\n    )\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ExportUserData {\n    exportUserData\n  }\n',
): (typeof documents)['\n  query ExportUserData {\n    exportUserData\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ImportUserData($data: String!) {\n    importUserData(data: $data) {\n      applicationsImported\n      applicationsSkipped\n      notesImported\n      documentsSkipped\n    }\n  }\n',
): (typeof documents)['\n  mutation ImportUserData($data: String!) {\n    importUserData(data: $data) {\n      applicationsImported\n      applicationsSkipped\n      notesImported\n      documentsSkipped\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query NotificationPreferences {\n    notificationPreferences {\n      weeklyDigestEnabled\n      digestFrequency\n      followUpRemindersEnabled\n      pushNotificationsEnabled\n      weeklyApplicationGoal\n    }\n  }\n',
): (typeof documents)['\n  query NotificationPreferences {\n    notificationPreferences {\n      weeklyDigestEnabled\n      digestFrequency\n      followUpRemindersEnabled\n      pushNotificationsEnabled\n      weeklyApplicationGoal\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdateNotificationPreferences(\n    $digestFrequency: DigestFrequency\n    $followUpRemindersEnabled: Boolean\n    $pushNotificationsEnabled: Boolean\n    $weeklyApplicationGoal: Int\n  ) {\n    updateNotificationPreferences(\n      digestFrequency: $digestFrequency\n      followUpRemindersEnabled: $followUpRemindersEnabled\n      pushNotificationsEnabled: $pushNotificationsEnabled\n      weeklyApplicationGoal: $weeklyApplicationGoal\n    )\n  }\n',
): (typeof documents)['\n  mutation UpdateNotificationPreferences(\n    $digestFrequency: DigestFrequency\n    $followUpRemindersEnabled: Boolean\n    $pushNotificationsEnabled: Boolean\n    $weeklyApplicationGoal: Int\n  ) {\n    updateNotificationPreferences(\n      digestFrequency: $digestFrequency\n      followUpRemindersEnabled: $followUpRemindersEnabled\n      pushNotificationsEnabled: $pushNotificationsEnabled\n      weeklyApplicationGoal: $weeklyApplicationGoal\n    )\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query StorageUsage {\n    me {\n      storageUsedBytes\n      storageLimitBytes\n    }\n  }\n',
): (typeof documents)['\n  query StorageUsage {\n    me {\n      storageUsedBytes\n      storageLimitBytes\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query LlmApiKeys {\n    llmApiKeys {\n      provider\n      model\n      baseUrl\n      monthlyTokenLimit\n    }\n    me {\n      aiProviderOrder\n      customAiPrompt\n      useCrossApplicationContext\n    }\n  }\n',
): (typeof documents)['\n  query LlmApiKeys {\n    llmApiKeys {\n      provider\n      model\n      baseUrl\n      monthlyTokenLimit\n    }\n    me {\n      aiProviderOrder\n      customAiPrompt\n      useCrossApplicationContext\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetAiProviderOrder($order: [String!]!) {\n    setAiProviderOrder(order: $order)\n  }\n',
): (typeof documents)['\n  mutation SetAiProviderOrder($order: [String!]!) {\n    setAiProviderOrder(order: $order)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {\n    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)\n  }\n',
): (typeof documents)['\n  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {\n    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteLlmApiKey($provider: String!) {\n    deleteLlmApiKey(provider: $provider)\n  }\n',
): (typeof documents)['\n  mutation DeleteLlmApiKey($provider: String!) {\n    deleteLlmApiKey(provider: $provider)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation SetLlmApiKeyMonthlyLimit($provider: String!, $monthlyTokenLimit: Int) {\n    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $monthlyTokenLimit)\n  }\n',
): (typeof documents)['\n  mutation SetLlmApiKeyMonthlyLimit($provider: String!, $monthlyTokenLimit: Int) {\n    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $monthlyTokenLimit)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {\n    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {\n      ok\n      error\n    }\n  }\n',
): (typeof documents)['\n  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {\n    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {\n      ok\n      error\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query LlmUsageSummary {\n    llmUsageSummary {\n      provider\n      requestCount\n      promptTokens\n      completionTokens\n      cacheReadTokens\n      cacheWriteTokens\n      lastUsedAt\n      monthlyTokenLimit\n      limitReached\n    }\n  }\n',
): (typeof documents)['\n  query LlmUsageSummary {\n    llmUsageSummary {\n      provider\n      requestCount\n      promptTokens\n      completionTokens\n      cacheReadTokens\n      cacheWriteTokens\n      lastUsedAt\n      monthlyTokenLimit\n      limitReached\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ApiTokens {\n    apiTokens {\n      id\n      name\n      scope\n      lastUsedAt\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query ApiTokens {\n    apiTokens {\n      id\n      name\n      scope\n      lastUsedAt\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {\n    createApiToken(name: $name, scope: $scope) {\n      id\n      name\n      token\n      scope\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {\n    createApiToken(name: $name, scope: $scope) {\n      id\n      name\n      token\n      scope\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteApiToken($id: ID!) {\n    deleteApiToken(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteApiToken($id: ID!) {\n    deleteApiToken(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query McpOAuthGrants {\n    mcpOAuthGrants {\n      id\n      clientName\n      scope\n      authorizedAt\n      lastUsedAt\n    }\n  }\n',
): (typeof documents)['\n  query McpOAuthGrants {\n    mcpOAuthGrants {\n      id\n      clientName\n      scope\n      authorizedAt\n      lastUsedAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RevokeMcpOAuthGrant($id: ID!) {\n    revokeMcpOAuthGrant(id: $id)\n  }\n',
): (typeof documents)['\n  mutation RevokeMcpOAuthGrant($id: ID!) {\n    revokeMcpOAuthGrant(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query ShareLinks {\n    shareLinks {\n      id\n      name\n      lastUsedAt\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query ShareLinks {\n    shareLinks {\n      id\n      name\n      lastUsedAt\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation CreateShareLink($name: String!) {\n    createShareLink(name: $name) {\n      id\n      name\n      token\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  mutation CreateShareLink($name: String!) {\n    createShareLink(name: $name) {\n      id\n      name\n      token\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DeleteShareLink($id: ID!) {\n    deleteShareLink(id: $id)\n  }\n',
): (typeof documents)['\n  mutation DeleteShareLink($id: ID!) {\n    deleteShareLink(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestEmailChange($currentPassword: String, $newEmail: String!) {\n    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)\n  }\n',
): (typeof documents)['\n  mutation RequestEmailChange($currentPassword: String, $newEmail: String!) {\n    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestAddBackupEmail($currentPassword: String, $backupEmail: String!) {\n    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)\n  }\n',
): (typeof documents)['\n  mutation RequestAddBackupEmail($currentPassword: String, $backupEmail: String!) {\n    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RemoveBackupEmail($currentPassword: String) {\n    removeBackupEmail(currentPassword: $currentPassword)\n  }\n',
): (typeof documents)['\n  mutation RemoveBackupEmail($currentPassword: String) {\n    removeBackupEmail(currentPassword: $currentPassword)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {\n    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)\n  }\n',
): (typeof documents)['\n  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {\n    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation Reauthenticate($password: String!, $code: String) {\n    reauthenticate(password: $password, code: $code) {\n      success\n      totpRequired\n      accessToken\n    }\n  }\n',
): (typeof documents)['\n  mutation Reauthenticate($password: String!, $code: String) {\n    reauthenticate(password: $password, code: $code) {\n      success\n      totpRequired\n      accessToken\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query SecurityActivity {\n    securityActivity {\n      id\n      eventType\n      ipAddress\n      userAgent\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query SecurityActivity {\n    securityActivity {\n      id\n      eventType\n      ipAddress\n      userAgent\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query Sessions {\n    sessions {\n      id\n      userAgent\n      ipAddress\n      deviceLabel\n      location\n      lastUsedAt\n      current\n    }\n  }\n',
): (typeof documents)['\n  query Sessions {\n    sessions {\n      id\n      userAgent\n      ipAddress\n      deviceLabel\n      location\n      lastUsedAt\n      current\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n',
): (typeof documents)['\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RevokeOtherSessions {\n    revokeOtherSessions\n  }\n',
): (typeof documents)['\n  mutation RevokeOtherSessions {\n    revokeOtherSessions\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query TotpEnabled {\n    totpEnabled\n  }\n',
): (typeof documents)['\n  query TotpEnabled {\n    totpEnabled\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation BeginTotpSetup($password: String!) {\n    beginTotpSetup(password: $password) {\n      secret\n      otpauthUrl\n      qrCodeDataUrl\n    }\n  }\n',
): (typeof documents)['\n  mutation BeginTotpSetup($password: String!) {\n    beginTotpSetup(password: $password) {\n      secret\n      otpauthUrl\n      qrCodeDataUrl\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation ConfirmTotpSetup($code: String!) {\n    confirmTotpSetup(code: $code) {\n      backupCodes\n    }\n  }\n',
): (typeof documents)['\n  mutation ConfirmTotpSetup($code: String!) {\n    confirmTotpSetup(code: $code) {\n      backupCodes\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation DisableTotp($password: String!) {\n    disableTotp(password: $password)\n  }\n',
): (typeof documents)['\n  mutation DisableTotp($password: String!) {\n    disableTotp(password: $password)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RegenerateTotpBackupCodes($currentPassword: String!) {\n    regenerateTotpBackupCodes(currentPassword: $currentPassword) {\n      backupCodes\n    }\n  }\n',
): (typeof documents)['\n  mutation RegenerateTotpBackupCodes($currentPassword: String!) {\n    regenerateTotpBackupCodes(currentPassword: $currentPassword) {\n      backupCodes\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query LinkedOAuthAccounts {\n    linkedOAuthAccounts {\n      provider\n      email\n      createdAt\n    }\n  }\n',
): (typeof documents)['\n  query LinkedOAuthAccounts {\n    linkedOAuthAccounts {\n      provider\n      email\n      createdAt\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {\n    unlinkOAuthAccount(provider: $provider)\n  }\n',
): (typeof documents)['\n  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {\n    unlinkOAuthAccount(provider: $provider)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  query StepUpMethods {\n    me {\n      stepUpMethods\n    }\n  }\n',
): (typeof documents)['\n  query StepUpMethods {\n    me {\n      stepUpMethods\n    }\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation StartOAuthReauth($provider: OAuthProvider!) {\n    startOAuthReauth(provider: $provider)\n  }\n',
): (typeof documents)['\n  mutation StartOAuthReauth($provider: OAuthProvider!) {\n    startOAuthReauth(provider: $provider)\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation RequestStepUpCode {\n    requestStepUpCode\n  }\n',
): (typeof documents)['\n  mutation RequestStepUpCode {\n    requestStepUpCode\n  }\n'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: '\n  mutation VerifyStepUpCode($code: String!) {\n    verifyStepUpCode(code: $code)\n  }\n',
): (typeof documents)['\n  mutation VerifyStepUpCode($code: String!) {\n    verifyStepUpCode(code: $code)\n  }\n'];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
