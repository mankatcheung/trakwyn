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
  'mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n  createWorkExperience(input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n  updateWorkExperience(id: $id, input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteWorkExperience($id: ID!) {\n  deleteWorkExperience(id: $id)\n}\n\nmutation CreateEducation($input: CreateEducationInput!) {\n  createEducation(input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n  updateEducation(id: $id, input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteEducation($id: ID!) {\n  deleteEducation(id: $id)\n}\n\nmutation CreateSkill($input: CreateSkillInput!) {\n  createSkill(input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n  updateSkill(id: $id, input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation DeleteSkill($id: ID!) {\n  deleteSkill(id: $id)\n}': typeof types.CreateWorkExperienceDocument;
  'query WorkExperiences {\n  workExperiences {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Educations {\n  educations {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Skills {\n  skills {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}': typeof types.WorkExperiencesDocument;
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
  'mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n  createWorkExperience(input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n  updateWorkExperience(id: $id, input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteWorkExperience($id: ID!) {\n  deleteWorkExperience(id: $id)\n}\n\nmutation CreateEducation($input: CreateEducationInput!) {\n  createEducation(input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n  updateEducation(id: $id, input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteEducation($id: ID!) {\n  deleteEducation(id: $id)\n}\n\nmutation CreateSkill($input: CreateSkillInput!) {\n  createSkill(input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n  updateSkill(id: $id, input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation DeleteSkill($id: ID!) {\n  deleteSkill(id: $id)\n}':
    types.CreateWorkExperienceDocument,
  'query WorkExperiences {\n  workExperiences {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Educations {\n  educations {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Skills {\n  skills {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}':
    types.WorkExperiencesDocument,
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
  source: 'mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n  createWorkExperience(input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n  updateWorkExperience(id: $id, input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteWorkExperience($id: ID!) {\n  deleteWorkExperience(id: $id)\n}\n\nmutation CreateEducation($input: CreateEducationInput!) {\n  createEducation(input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n  updateEducation(id: $id, input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteEducation($id: ID!) {\n  deleteEducation(id: $id)\n}\n\nmutation CreateSkill($input: CreateSkillInput!) {\n  createSkill(input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n  updateSkill(id: $id, input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation DeleteSkill($id: ID!) {\n  deleteSkill(id: $id)\n}',
): (typeof documents)['mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {\n  createWorkExperience(input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {\n  updateWorkExperience(id: $id, input: $input) {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteWorkExperience($id: ID!) {\n  deleteWorkExperience(id: $id)\n}\n\nmutation CreateEducation($input: CreateEducationInput!) {\n  createEducation(input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {\n  updateEducation(id: $id, input: $input) {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nmutation DeleteEducation($id: ID!) {\n  deleteEducation(id: $id)\n}\n\nmutation CreateSkill($input: CreateSkillInput!) {\n  createSkill(input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation UpdateSkill($id: ID!, $input: UpdateSkillInput!) {\n  updateSkill(id: $id, input: $input) {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}\n\nmutation DeleteSkill($id: ID!) {\n  deleteSkill(id: $id)\n}'];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(
  source: 'query WorkExperiences {\n  workExperiences {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Educations {\n  educations {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Skills {\n  skills {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}',
): (typeof documents)['query WorkExperiences {\n  workExperiences {\n    id\n    company\n    title\n    location\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Educations {\n  educations {\n    id\n    institution\n    degree\n    field\n    startDate\n    endDate\n    description\n    createdAt\n    updatedAt\n  }\n}\n\nquery Skills {\n  skills {\n    id\n    name\n    category\n    proficiency\n    createdAt\n  }\n}'];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> =
  TDocumentNode extends DocumentNode<infer TType, any> ? TType : never;
