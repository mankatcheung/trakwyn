"""Map every tracked apps/web/src file to its proposed feature-first path.

Usage: python3 -I mapping.py files.txt  -> writes mapping.tsv and tree.txt next to this script.
Fails (exit 1) listing any file that no rule places.
"""
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
F = 'features/'
A = 'routes/_authenticated/'
AD = A + 'applications/$applicationId/'
ADC = AD + '-components/'

# Stays exactly where it is.
KEEP_PREFIXES = ('graphql/generated/', 'i18n/', 'lib/analytics/', 'server/')
KEEP_FILES = {
    'CLAUDE.md', 'constants.ts', 'routeTree.gen.ts', 'router.tsx', 'server.ts', 'start.ts', 'styles.css',
    'graphql/client.ts',
    'components/ErrorState.tsx', 'components/Markdown.tsx', 'components/LogoMark.tsx',
    'components/RouteErrorReporter.tsx', 'components/StaleChunkReloader.tsx',
    'hooks/useDebouncedCallback.ts', 'hooks/useHotkeys.ts', 'hooks/useUnsavedChangesGuard.ts',
    'lib/CLAUDE.md', 'lib/apiOrigin.ts', 'lib/errors.ts', 'lib/graphqlError.ts', 'lib/i18n.tsx',
    'lib/queryClient.ts', 'lib/safeMarkdownUrl.ts', 'lib/seo.ts', 'lib/staleChunkReload.ts',
    'lib/swUpdateToast.ts', 'lib/theme.tsx', 'lib/undoToast.ts', 'lib/pendingOperations.ts',
    '__tests__/setup.ts', '__tests__/a11y.test.tsx',
}

# Moves to hooks/ (shared, generic).
TO_SHARED_HOOKS = ['useCooldown.ts', 'useFormAction.ts', 'useMediaQuery.ts', 'useInfiniteScrollSentinel.ts']

SRC = {
    # --- graphql documents -> owning feature
    'graphql/queries/activityLogs.graphql': F + 'application-detail/graphql/activityLogs.queries.graphql',
    'graphql/queries/applications.graphql': F + 'applications/graphql/applications.queries.graphql',
    'graphql/mutations/applications.graphql': F + 'applications/graphql/applications.mutations.graphql',
    'graphql/mutations/jobDescription.graphql': F + 'applications/graphql/jobDescription.mutations.graphql',
    'graphql/mutations/auth.graphql': F + 'auth/graphql/auth.mutations.graphql',
    'graphql/queries/contacts.graphql': F + 'application-detail/graphql/contacts.queries.graphql',
    'graphql/mutations/contacts.graphql': F + 'application-detail/graphql/contacts.mutations.graphql',
    'graphql/queries/documents.graphql': F + 'documents/graphql/documents.queries.graphql',
    'graphql/mutations/documents.graphql': F + 'documents/graphql/documents.mutations.graphql',
    'graphql/queries/experiences.graphql': F + 'profile/graphql/experiences.queries.graphql',
    'graphql/mutations/experiences.graphql': F + 'profile/graphql/experiences.mutations.graphql',
    'graphql/queries/interviewQuestions.graphql': F + 'interviews/graphql/interviewQuestions.queries.graphql',
    'graphql/mutations/interviewQuestions.graphql': F + 'interviews/graphql/interviewQuestions.mutations.graphql',
    'graphql/queries/interviewRounds.graphql': F + 'interviews/graphql/interviewRounds.queries.graphql',
    'graphql/mutations/interviewRounds.graphql': F + 'interviews/graphql/interviewRounds.mutations.graphql',
    'graphql/queries/mockInterviewQuestions.graphql': F + 'interviews/graphql/mockInterviewQuestions.queries.graphql',
    'graphql/mutations/mockInterviewQuestions.graphql': F + 'interviews/graphql/mockInterviewQuestions.mutations.graphql',
    'graphql/queries/notes.graphql': F + 'notes/graphql/notes.queries.graphql',
    'graphql/mutations/notes.graphql': F + 'notes/graphql/notes.mutations.graphql',

    # --- components/ root
    'components/AiCreditsMeter.tsx': F + 'ai/components/AiCreditsMeter.tsx',
    'components/AiErrorMessage.tsx': F + 'ai/components/AiErrorMessage.tsx',
    'components/AiFeedbackControl.tsx': F + 'ai/components/AiFeedbackControl.tsx',
    'components/ApplicationCapNotice.tsx': F + 'quota/components/ApplicationCapNotice.tsx',
    'components/QuotaHint.tsx': F + 'quota/components/QuotaHint.tsx',
    'components/ApplicationDisplayFieldsPicker.tsx': F + 'applications/components/ApplicationDisplayFieldsPicker.tsx',
    'components/StatusSelect.tsx': F + 'applications/components/StatusSelect.tsx',
    'components/AuthDivider.tsx': F + 'auth/components/AuthDivider.tsx',
    'components/OAuthButtons.tsx': F + 'auth/components/OAuthButtons.tsx',
    'components/OAuthProviderLogo.tsx': F + 'auth/components/OAuthProviderLogo.tsx',
    'components/PasswordField.tsx': F + 'auth/components/PasswordField.tsx',
    'components/CaptchaWidget.tsx': F + 'auth/components/CaptchaWidget.tsx',
    'components/CommandPalette.tsx': F + 'app-shell/components/CommandPalette.tsx',
    'components/LazyCommandPalette.tsx': F + 'app-shell/components/LazyCommandPalette.tsx',
    'components/ShortcutCheatSheet.tsx': F + 'app-shell/components/ShortcutCheatSheet.tsx',
    'components/LazyShortcutCheatSheet.tsx': F + 'app-shell/components/LazyShortcutCheatSheet.tsx',
    'components/NavigationProgressBar.tsx': F + 'app-shell/components/NavigationProgressBar.tsx',
    'components/CookieConsent.tsx': F + 'legal/components/CookieConsent.tsx',
    'components/LegalFooterLinks.tsx': F + 'legal/components/LegalFooterLinks.tsx',
    'components/LegalPageLayout.tsx': F + 'legal/components/LegalPageLayout.tsx',
    'components/LockedAnalyticsSample.tsx': F + 'analytics/components/LockedAnalyticsSample.tsx',
    'components/LockedFeaturePreview.tsx': F + 'plans/components/LockedFeaturePreview.tsx',
    'components/UpgradePrompt.tsx': F + 'plans/components/UpgradePrompt.tsx',
    'components/ResendVerificationEmail.tsx': F + 'verification/components/ResendVerificationEmail.tsx',
    'components/marketing/GuideMarkdown.tsx': F + 'guides/components/GuideMarkdown.tsx',

    # --- hooks/
    'hooks/usePushNotifications.ts': F + 'notifications/hooks/usePushNotifications.ts',

    # --- lib/
    'lib/accountDeletion.ts': F + 'account-deletion/lib/accountDeletion.ts',
    'lib/aiCredits.ts': F + 'ai/lib/aiCredits.ts',
    'lib/aiFeedback.ts': F + 'ai/lib/aiFeedback.ts',
    'lib/applicationDisplayFields.ts': F + 'applications/lib/applicationDisplayFields.ts',
    'lib/statusColors.ts': F + 'applications/lib/statusColors.ts',
    'lib/billingCheckout.ts': F + 'plans/lib/billingCheckout.ts',
    'lib/billingStatus.ts': F + 'plans/lib/billingStatus.ts',
    'lib/chatDock.tsx': F + 'chat/lib/chatDock.tsx',
    'lib/chatStream.ts': F + 'chat/lib/chatStream.ts',
    'lib/commandPaletteShortcut.ts': F + 'app-shell/lib/commandPaletteShortcut.ts',
    'lib/consentRegion.ts': F + 'legal/lib/consentRegion.ts',
    'lib/cookieConsent.ts': F + 'legal/lib/cookieConsent.ts',
    'lib/contentQuota.ts': F + 'quota/lib/contentQuota.ts',
    'lib/cvImport.ts': F + 'profile/lib/cvImport.ts',
    'lib/documentCategory.ts': F + 'documents/lib/documentCategory.ts',
    'lib/documentListItems.ts': F + 'documents/lib/documentListItems.ts',
    'lib/downloadUrl.ts': F + 'documents/lib/downloadUrl.ts',
    'lib/documentPage.ts': F + 'documents/lib/editor/documentPage.ts',
    'lib/editorLinks.ts': F + 'documents/lib/editor/editorLinks.ts',
    'lib/markdownToTiptapDoc.ts': F + 'documents/lib/editor/markdownToTiptapDoc.ts',
    'lib/proseToTiptapDoc.ts': F + 'documents/lib/editor/proseToTiptapDoc.ts',
    'lib/emailVerification.ts': F + 'verification/lib/emailVerification.ts',
    'lib/guideFeeds.ts': F + 'guides/lib/guideFeeds.ts',
    'lib/guides.ts': F + 'guides/lib/guides.ts',
    'lib/oauthError.ts': F + 'auth/lib/oauthError.ts',
    'lib/returnTo.ts': F + 'auth/lib/returnTo.ts',
    'lib/sessionGate.ts': F + 'auth/lib/sessionGate.ts',
    'lib/useCaptcha.ts': F + 'auth/hooks/useCaptcha.ts',
    'lib/useIsLoggedIn.ts': F + 'auth/hooks/useIsLoggedIn.ts',
    'lib/onboarding.ts': F + 'onboarding/lib/onboarding.ts',
    'lib/screenshots.ts': F + 'marketing/lib/screenshots.ts',
    'lib/storageUsage.ts': F + 'settings/lib/storageUsage.ts',

    # --- routes/-components (public pages)
    'routes/-components/AccessibilityPage.tsx': F + 'legal/pages/AccessibilityPage.tsx',
    'routes/-components/PrivacyPage.tsx': F + 'legal/pages/PrivacyPage.tsx',
    'routes/-components/TermsPage.tsx': F + 'legal/pages/TermsPage.tsx',
    'routes/-components/AccountDeletionLayout.tsx': F + 'account-deletion/components/AccountDeletionLayout.tsx',
    'routes/-components/AccountDeletionScheduledPage.tsx': F + 'account-deletion/pages/AccountDeletionScheduledPage.tsx',
    'routes/-components/CancelAccountDeletionPage.tsx': F + 'account-deletion/pages/CancelAccountDeletionPage.tsx',
    'routes/-components/ConfirmAccountDeletionPage.tsx': F + 'account-deletion/pages/ConfirmAccountDeletionPage.tsx',
    'routes/-components/AiMcpSetupPage.tsx': F + 'marketing/pages/AiMcpSetupPage.tsx',
    'routes/-components/PricingPage.tsx': F + 'marketing/pages/PricingPage.tsx',
    'routes/-components/ChangeEmailForm.tsx': F + 'auth/components/ChangeEmailForm.tsx',
    'routes/-components/ConfirmBackupEmailPage.tsx': F + 'auth/pages/ConfirmBackupEmailPage.tsx',
    'routes/-components/ForgotPasswordPage.tsx': F + 'auth/pages/ForgotPasswordPage.tsx',
    'routes/-components/LoginPage.tsx': F + 'auth/pages/LoginPage.tsx',
    'routes/-components/RegisterPage.tsx': F + 'auth/pages/RegisterPage.tsx',
    'routes/-components/ResetPasswordPage.tsx': F + 'auth/pages/ResetPasswordPage.tsx',
    'routes/-components/SharedSummaryPage.tsx': F + 'share/pages/SharedSummaryPage.tsx',
    'routes/-components/VerifyEmailPage.tsx': F + 'verification/pages/VerifyEmailPage.tsx',
    'routes/-components/VerifyEmailRequiredPage.tsx': F + 'verification/pages/VerifyEmailRequiredPage.tsx',
    'routes/oauth/-components/McpAuthorizePage.tsx': F + 'auth/pages/McpAuthorizePage.tsx',

    # --- routes/_authenticated loose files
    A + '-analytics-page.tsx': F + 'analytics/pages/AnalyticsPage.tsx',
    A + '-analytics-queries.ts': F + 'analytics/graphql/analyticsQueries.ts',
    A + '-application-channel-analytics-panel.tsx': F + 'analytics/components/ApplicationChannelAnalyticsPanel.tsx',
    A + '-application-channel-analytics-queries.ts': F + 'analytics/graphql/applicationChannelQueries.ts',
    A + '-document-version-outcomes-panel.tsx': F + 'analytics/components/DocumentVersionOutcomesPanel.tsx',
    A + '-document-version-outcomes-queries.ts': F + 'analytics/graphql/documentVersionOutcomesQueries.ts',
    A + '-interview-round-analytics-panel.tsx': F + 'analytics/components/InterviewRoundAnalyticsPanel.tsx',
    A + '-interview-round-analytics-queries.ts': F + 'analytics/graphql/interviewRoundQueries.ts',
    A + '-offer-analytics-panel.tsx': F + 'analytics/components/OfferAnalyticsPanel.tsx',
    A + '-offer-analytics-queries.ts': F + 'analytics/graphql/offerAnalyticsQueries.ts',
    A + '-response-time-analytics-panel.tsx': F + 'analytics/components/ResponseTimeAnalyticsPanel.tsx',
    A + '-response-time-analytics-queries.ts': F + 'analytics/graphql/responseTimeQueries.ts',
    A + '-chat-dock-floating-window.tsx': F + 'chat/components/dock/ChatDockFloatingWindow.tsx',
    A + '-chat-dock-footer.tsx': F + 'chat/components/dock/ChatDockFooter.tsx',
    A + '-chat-dock-picker.tsx': F + 'chat/components/dock/ChatDockPicker.tsx',
    A + '-dashboardQueries.ts': F + 'dashboard/graphql/dashboardQueries.ts',
    A + '-notification-inbox.tsx': F + 'notifications/components/NotificationInbox.tsx',
    A + '-notification-popover.tsx': F + 'notifications/components/NotificationPopover.tsx',
    A + '-offers-page.tsx': F + 'offers/pages/OffersPage.tsx',
    A + '-offers-queries.ts': F + 'offers/graphql/offersQueries.ts',
    A + '-components/AssistantNavConversations.tsx': F + 'chat/components/AssistantNavConversations.tsx',
    A + '-components/LazyChatDockFloatingWindow.tsx': F + 'chat/components/dock/LazyChatDockFloatingWindow.tsx',
    A + '-components/AuthenticatedLayout.tsx': F + 'app-shell/components/AuthenticatedLayout.tsx',
    A + '-components/CvProfileSummaryCard.tsx': F + 'dashboard/components/CvProfileSummaryCard.tsx',
    A + '-components/DashboardPending.tsx': F + 'dashboard/components/DashboardPending.tsx',
    A + '-components/DashboardPage.tsx': F + 'dashboard/pages/DashboardPage.tsx',
    A + '-components/NotificationsPage.tsx': F + 'notifications/pages/NotificationsPage.tsx',
    A + '-components/OnboardingChecklist.tsx': F + 'onboarding/components/OnboardingChecklist.tsx',
    A + '-components/StatusBadge.tsx': F + 'applications/components/StatusBadge.tsx',
    A + '-components/welcome/WelcomePage.tsx': F + 'onboarding/pages/WelcomePage.tsx',
    A + '-components/welcome/AiKeyStep.tsx': F + 'onboarding/components/welcome/AiKeyStep.tsx',
    A + '-components/welcome/GoalsStep.tsx': F + 'onboarding/components/welcome/GoalsStep.tsx',
    A + '-components/welcome/ProfileStep.tsx': F + 'onboarding/components/welcome/ProfileStep.tsx',
    A + '-components/welcome/WelcomeStepFrame.tsx': F + 'onboarding/components/welcome/WelcomeStepFrame.tsx',

    # --- applications list / board / trash / new
    A + 'applications/-board-move.ts': F + 'applications/lib/boardMove.ts',
    A + 'applications/-board-page.tsx': F + 'applications/pages/BoardPage.tsx',
    A + 'applications/-board-queries.ts': F + 'applications/graphql/boardQueries.ts',
    A + 'applications/-deleteWithUndo.ts': F + 'applications/lib/deleteWithUndo.ts',
    A + 'applications/-trash-queries.ts': F + 'applications/graphql/trashQueries.ts',
    A + 'applications/-useBulkActions.ts': F + 'applications/hooks/useBulkActions.ts',
    A + 'applications/-components/ApplicationsPage.tsx': F + 'applications/pages/ApplicationsPage.tsx',
    A + 'applications/-components/NewApplicationPage.tsx': F + 'applications/pages/NewApplicationPage.tsx',
    A + 'applications/-components/TrashPage.tsx': F + 'applications/pages/TrashPage.tsx',
    A + 'applications/-components/EmptyTrashDialog.tsx': F + 'applications/components/trash/EmptyTrashDialog.tsx',
    A + 'applications/-components/JdImportPanel.tsx': F + 'applications/components/new/JdImportPanel.tsx',
    A + 'applications/-components/PostingTextField.tsx': F + 'applications/components/new/PostingTextField.tsx',

    # --- $applicationId loose files
    AD + '-application-query.ts': F + 'application-detail/graphql/applicationQuery.ts',
    AD + '-sectionCounts.ts': F + 'application-detail/lib/sectionCounts.ts',
    AD + '-sections.ts': F + 'application-detail/lib/sections.ts',
    AD + '-documentQueries.ts': F + 'documents/graphql/documentQueries.ts',
    AD + '-draftHistoryQueries.ts': F + 'documents/graphql/draftHistoryQueries.ts',
    AD + '-polishApi.ts': F + 'documents/graphql/polishApi.ts',
    AD + '-postingRequirementsQueries.ts': F + 'documents/graphql/postingRequirementsQueries.ts',
    AD + '-resumeAtsQueries.ts': F + 'documents/graphql/resumeAtsQueries.ts',
    AD + '-resumeGapsQueries.ts': F + 'documents/graphql/resumeGapsQueries.ts',
    AD + '-resumeMatchQueries.ts': F + 'documents/graphql/resumeMatchQueries.ts',
    AD + 'offers/-offersQueries.ts': F + 'offers/graphql/applicationOffersQueries.ts',

    # --- assistant
    A + 'assistant/-runsOn.ts': F + 'chat/lib/runsOn.ts',
    A + 'assistant/-shared.ts': F + 'chat/lib/shared.ts',
    A + 'assistant/-components/AssistantPage.tsx': F + 'chat/pages/AssistantPage.tsx',
    A + 'assistant/-components/ConversationHistoryPage.tsx': F + 'chat/pages/ConversationHistoryPage.tsx',
    A + 'assistant/-components/ChatComposerInput.tsx': F + 'chat/components/ChatComposerInput.tsx',
    A + 'assistant/-components/ChatConversationView.tsx': F + 'chat/components/ChatConversationView.tsx',
    A + 'assistant/-components/ChatProposalCard.tsx': F + 'chat/components/ChatProposalCard.tsx',

    # --- profile
    A + 'profile/CLAUDE.md': F + 'profile/CLAUDE.md',
    A + 'profile/-components/CvImportDialog.tsx': F + 'profile/components/cv-import/CvImportDialog.tsx',
    A + 'profile/-components/CvImportReview.tsx': F + 'profile/components/cv-import/CvImportReview.tsx',
    A + 'profile/-components/cvImportDrafts.ts': F + 'profile/lib/cvImportDrafts.ts',
    A + 'profile/-components/CompletenessMeter.tsx': F + 'profile/components/CompletenessMeter.tsx',
    A + 'profile/-components/profileCompleteness.ts': F + 'profile/lib/profileCompleteness.ts',
    A + 'profile/-components/deleteProfileItemWithUndo.ts': F + 'profile/lib/deleteProfileItemWithUndo.ts',
    A + 'profile/-components/profileQueries.ts': F + 'profile/graphql/profileQueries.ts',
    A + 'profile/-components/useProfileData.ts': F + 'profile/hooks/useProfileData.ts',

    # --- settings
    A + 'settings/CLAUDE.md': F + 'settings/CLAUDE.md',
    A + 'settings/-components/shared.ts': F + 'settings/lib/shared.ts',
    A + 'settings/-components/aiProviderOrder.ts': F + 'settings/lib/aiProviderOrder.ts',
    A + 'settings/-components/useStepUpReauth.tsx': F + 'settings/hooks/useStepUpReauth.tsx',
}

# Groups handled by pattern: (old dir, new dir) for files not in SRC.
SETTINGS_GROUPS = {
    'ai': ['AddLlmApiKeyForm', 'AiProviderOrderCard', 'CustomAiPromptForm', 'LlmApiKeyRow'],
    'security': ['BackupEmailForms', 'EmailChangeForm', 'PasswordUpdateForm', 'StepUpPasswordForm',
                 'StepUpWithoutPassword', 'TwoFactorForms'],
    'integrations': ['ApiTokensCard', 'McpClientsCard', 'ShareLinksCard'],
    'account': ['ProfileDetailsForm', 'StorageCard'],
}
for group, names in SETTINGS_GROUPS.items():
    for n in names:
        SRC[A + f'settings/-components/{n}.tsx'] = F + f'settings/components/{group}/{n}.tsx'

DETAIL = {
    'application-detail/pages': ['ApplicationDetailPage', 'EditApplicationPage'],
    'application-detail/components': ['TrashedApplicationView'],
    'application-detail/components/header': ['ApplicationActionsMenu', 'ApplicationActionsSheet', 'ApplicationInfoChips',
                                             'ApplicationJobInfo', 'CollapsibleDescription', 'InfoItem'],
    'application-detail/components/sections': ['SectionNav', 'SectionIndex', 'SectionPanes', 'SectionGeneratedMarker'],
    'application-detail/components/tabs': ['OverviewTab', 'ActivityTab', 'ContactsTab', 'CompanyBriefingTab'],
    'notes/components': ['NotesTab'],
    'ai/components': ['AiGeneratedBadge', 'AiHelperPanel'],
    'documents/components': ['DocumentList', 'DocumentListRow', 'DocumentPreviewModal', 'DocumentUploadPanel',
                             'ImportDocumentAction', 'CreateDraftButton', 'DraftTitleField', 'DraftHistoryPanel',
                             'ResumeSourcePicker', 'EmptyProfilePrompt'],
    'documents/components/editor': ['DocumentDraftEditor', 'DocumentEditorBubbleMenu', 'DocumentEditorChecks',
                                    'DocumentEditorFindBar', 'DocumentEditorLinkForm', 'DocumentEditorStatusBar',
                                    'DocumentEditorTableMenu', 'DocumentEditorToolbar', 'EditorToolbarButton',
                                    'SlashMenu', 'InlineAiForm', 'InlineAiLayer', 'SelectionProposalCard',
                                    'PolishPreview'],
    'documents/components/review': ['ResumeAtsPanel', 'ResumeGapsPanel', 'ResumeMatchPanel', 'HealthScorePanel',
                                    'PostingRequirementsPanel'],
    'documents/lib': ['documentUploadAccess', 'documentUploadReporting'],
    'documents/lib/editor': ['editorMarkCommands'],
    'documents/hooks': ['useCreateOrOpenDraft', 'useInlineAi'],
    'interviews/components': ['InterviewsTab', 'InterviewQuestionsPanel', 'QuestionEntryForm'],
    'interviews/components/mock': ['MockQuestionsPanel', 'MockQuestionGenerator', 'MockAnswerDraft',
                                   'MockTalkingPoints', 'MockBackgroundPicker'],
    'interviews/lib': ['questionFormSchema', 'interviewQuestionLimits', 'mockBackgroundChoice'],
    'interviews/graphql': ['mockQuestionApi'],
    'offers/components': ['OfferForm'],
    'offers/lib': ['offerFormSchema'],
}


def is_route_file(path: str) -> bool:
    """A TanStack route file: under routes/, not in a -components dir, not '-' prefixed."""
    if not path.startswith('routes/'):
        return False
    parts = path.split('/')
    return not any(p.startswith('-') for p in parts[1:])


def map_source(path: str, files: set) -> str | None:
    if path in KEEP_FILES or path.startswith(KEEP_PREFIXES):
        return path
    if path in SRC:
        return SRC[path]
    base = os.path.basename(path)
    stem = re.sub(r'\.(tsx?|graphql)$', '', base)
    if path.startswith('lib/') and base in TO_SHARED_HOOKS:
        return 'hooks/' + base
    if path.startswith('lib/editor/'):
        return F + 'documents/lib/editor/' + base
    if path.startswith('components/ai/hooks/'):
        return F + 'ai/hooks/' + base
    if path.startswith('components/ai/'):
        return F + 'ai/components/' + base
    if path.startswith('components/marketing/'):
        return F + 'marketing/components/' + base
    if path.startswith('routes/features/-components/'):
        return F + 'marketing/pages/' + base
    if path.startswith('routes/guides/-components/'):
        return F + 'guides/pages/' + base
    if path.startswith(ADC):
        for new_dir, stems in DETAIL.items():
            if stem in stems:
                return F + f'{new_dir}/{base}'
        return None
    if path.startswith(A + 'settings/-components/') and base.endswith('Page.tsx'):
        return F + 'settings/pages/' + base
    if path.startswith(A + 'profile/-components/') and base.endswith('Section.tsx'):
        return F + 'profile/components/sections/' + base
    if is_route_file(path):
        return path
    return None


# Tests with no same-named source, placed by what they cover.
TESTS = {
    'components/AccountDeletionPages.test.tsx': F + 'account-deletion/pages/__tests__/',
    'components/AiBuildingBlocks.test.tsx': F + 'ai/components/__tests__/',
    'components/ApplicationDetailSectionSwitch.test.tsx': F + 'application-detail/pages/__tests__/',
    'components/AssistantChatPage.test.tsx': F + 'chat/pages/__tests__/',
    'components/AssistantChatProvider.test.tsx': F + 'chat/lib/__tests__/',
    'components/ConversationListProvider.test.tsx': F + 'chat/lib/__tests__/',
    'components/AssistantHistoryPage.test.tsx': F + 'chat/pages/__tests__/',
    'components/authFormActions.test.tsx': F + 'auth/pages/__tests__/',
    'components/CaptchaForms.test.tsx': F + 'auth/components/__tests__/',
    'components/ConfirmEmailChangePage.test.tsx': F + 'auth/components/__tests__/',
    'components/CalendarPage.test.tsx': '__tests__/routes/',
    'components/DocumentDraftEditPage.test.tsx': '__tests__/routes/',
    'components/LandingPage.test.tsx': '__tests__/routes/',
    'components/NewDocumentDraftRedirect.test.ts': '__tests__/routes/',
    'components/OffersIndexPage.test.tsx': '__tests__/routes/',
    'components/profile/ProfilePage.test.tsx': '__tests__/routes/',
    'components/settings/SettingsExperienceRedirect.test.ts': '__tests__/routes/',
    'components/DocumentDraftSaveState.test.tsx': F + 'documents/lib/editor/__tests__/',
    'components/DocumentLanguage.test.tsx': F + 'documents/lib/editor/__tests__/',
    'components/DocumentTablesHighlight.test.tsx': F + 'documents/components/editor/__tests__/',
    'components/InlineAiActions.test.tsx': F + 'documents/hooks/__tests__/',
    'components/GuidePages.test.tsx': F + 'guides/pages/__tests__/',
    'components/OffersPage.test.tsx': F + 'offers/pages/__tests__/',
    'components/QuotaWiring.test.tsx': F + 'quota/components/__tests__/',
    'components/StorageUsage.test.tsx': F + 'settings/lib/__tests__/',
    'components/settings/FormActions.test.tsx': F + 'settings/components/__tests__/',
    'components/settings/SettingsFormActions.test.tsx': F + 'settings/pages/__tests__/',
    'components/profile/CvImportNewSectionsDialog.test.tsx': F + 'profile/components/cv-import/__tests__/',
    'components/profile/cvImportNewSections.test.ts': F + 'profile/lib/__tests__/',
    'components/profile/ProfileSections.test.tsx': F + 'profile/components/sections/__tests__/',
    'components/profile/ProfileSectionsDeleteUndo.test.tsx': F + 'profile/components/sections/__tests__/',
    'components/profile/ProfileSectionsFormActions.test.tsx': F + 'profile/components/sections/__tests__/',
    'components/profile/ProjectsAwardsSections.test.tsx': F + 'profile/components/sections/__tests__/',
    'lib/documentSections.test.ts': F + 'application-detail/lib/__tests__/',
    'lib/draftEditorLinks.test.ts': F + 'documents/lib/editor/__tests__/',
    'lib/i18nParity.test.ts': 'lib/__tests__/',
    'lib/queryRetry.test.ts': 'lib/__tests__/',
    'lib/securityEventLabels.test.ts': F + 'settings/components/security/__tests__/',
    'graphql/client.test.ts': 'graphql/__tests__/',
    'server/start.test.ts': '__tests__/',
}
# Test dirs that stay in src/__tests__ (cross-cutting, or route tests: a __tests__ dir under
# routes/ would be read as a route segment by the TanStack router plugin).
TEST_KEEP_DIRS = ('config/', 'content/', 'guides/', 'routes/')


def map_test(path: str, src_by_stem: dict) -> str | None:
    rel = path[len('__tests__/'):]
    base = os.path.basename(rel)
    if path in KEEP_FILES or rel.startswith(TEST_KEEP_DIRS):
        return path
    if rel in TESTS:
        return TESTS[rel] + base
    if rel.startswith('lib/analytics/'):
        return 'lib/analytics/__tests__/' + base
    if rel.startswith('server/observability/'):
        return 'server/observability/__tests__/' + base
    stem = re.sub(r'\.test\.tsx?$', '', base)
    target = src_by_stem.get(stem) or src_by_stem.get(stem.lower())
    if target:
        return os.path.dirname(target) + '/__tests__/' + base
    return None


def render_tree(paths: list) -> str:
    tree: dict = {}
    for p in paths:
        node = tree
        for part in p.split('/'):
            node = node.setdefault(part, {})
    lines = ['src/']

    def walk(node: dict, prefix: str) -> None:
        dirs = sorted(k for k, v in node.items() if v)
        leaves = sorted(k for k, v in node.items() if not v)
        # tests last inside a dir, folders before files
        order = [d for d in dirs if d != '__tests__'] + leaves + [d for d in dirs if d == '__tests__']
        for i, name in enumerate(order):
            last = i == len(order) - 1
            lines.append(prefix + ('└── ' if last else '├── ') + name + ('/' if node[name] else ''))
            if node[name]:
                walk(node[name], prefix + ('    ' if last else '│   '))

    walk(tree, '')
    return '\n'.join(lines)


def main() -> int:
    files = [l.strip() for l in open(sys.argv[1]) if l.strip()]
    fileset = set(files)
    sources = [f for f in files if not f.startswith('__tests__/') or f in KEEP_FILES]
    tests = [f for f in files if f.startswith('__tests__/') and f not in KEEP_FILES]
    mapping, unmapped = {}, []
    for f in sources:
        new = map_source(f, fileset)
        (unmapped.append(f) if new is None else mapping.__setitem__(f, new))
    src_by_stem = {}
    for old, new in mapping.items():
        stem = re.sub(r'\.(tsx?|graphql)$', '', os.path.basename(new))
        src_by_stem.setdefault(stem, new)
        src_by_stem.setdefault(stem.lower(), new)
    for f in tests:
        new = map_test(f, src_by_stem)
        (unmapped.append(f) if new is None else mapping.__setitem__(f, new))
    if unmapped:
        print('UNMAPPED:\n  ' + '\n  '.join(unmapped))
        return 1
    dupes = defaultdict(list)
    for old, new in mapping.items():
        dupes[new].append(old)
    clashes = {k: v for k, v in dupes.items() if len(v) > 1}
    if clashes:
        print('CLASHES:', clashes)
        return 1
    with open(os.path.join(HERE, 'mapping.tsv'), 'w') as out:
        for old in sorted(mapping):
            out.write(f'{old}\t{mapping[old]}\n')
    # Tree without generated/i18n noise, folded to one line each.
    shown = []
    for new in mapping.values():
        if new.startswith('graphql/generated/'):
            new = 'graphql/generated/… (codegen output, untouched)'
        elif new.startswith('i18n/'):
            new = 'i18n/… (en, en-GB, zh-CN, zh-HK, zh-TW .json, untouched)'
        shown.append(new)
    with open(os.path.join(HERE, 'tree.txt'), 'w') as out:
        out.write(render_tree(sorted(set(shown))) + '\n')
    moved = sum(1 for o, n in mapping.items() if o != n)
    print(f'{len(mapping)} files mapped, {moved} move, {len(mapping) - moved} stay')
    return 0


if __name__ == '__main__':
    sys.exit(main())
