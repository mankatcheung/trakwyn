import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import {
  useDeleteLlmApiKey,
  useLlmApiKeys,
  useLlmUsageSummary,
  useSaveLlmApiKey,
  useSetDefaultLlmProvider,
  useSetLlmApiKeyMonthlyLimit,
  useTestLlmApiKey,
  useToggleCrossApplicationContext,
  useToggleFallbackWhenLimited,
  useUpdateCustomAiPrompt,
} from '../hooks/useLlmApiKeys';
import { LLM_PROVIDER_LABEL, LLM_PROVIDERS, type LlmApiKey, type LlmUsageSummary } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

/** Above this share of the limit the meter warns rather than just reports. */
const NEARING_LIMIT_RATIO = 0.8;

const PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000];

/** The 1st of next month, which is when the allowance refills. */
function nextResetLabel(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString();
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={2} fill={color} />
      <Circle cx={12} cy={12} r={2} fill={color} />
      <Circle cx={12} cy={19} r={2} fill={color} />
    </Svg>
  );
}

interface ProviderPickerProps {
  value: string;
  onChange: (provider: string) => void;
}

/** List-selector for the "add provider" form's provider field — opens a
 * bottom sheet listing every supported provider, consistent with the other
 * per-key sheets on this screen. */
function ProviderPicker({ value, onChange }: ProviderPickerProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={styles.pickerField}
        onPress={() => setOpen(true)}
        testID="provider-picker-field"
      >
        <Text style={styles.pickerFieldText}>{LLM_PROVIDER_LABEL[value] ?? value}</Text>
        <Text style={styles.pickerFieldChevron}>⌄</Text>
      </Pressable>

      {open && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setOpen(false)}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setOpen(false)}
            testID="provider-picker-backdrop"
          />
          <View style={styles.sheetContainer}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{t('ai.providerLabel')}</Text>
              {LLM_PROVIDERS.map((p) => (
                <Pressable
                  key={p}
                  style={styles.sheetRow}
                  onPress={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  testID={`provider-option-${p}`}
                >
                  <Text style={[styles.sheetRowText, p === value && styles.sheetRowTextSelected]}>
                    {LLM_PROVIDER_LABEL[p]}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.sheetCancel}
                onPress={() => setOpen(false)}
                testID="provider-picker-cancel"
              >
                <Text style={styles.sheetCancelText}>{t('ai.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

interface KeyRowProps {
  apiKey: LlmApiKey;
  usage?: LlmUsageSummary;
  isDefault: boolean;
  onOpenActions: () => void;
}

function KeyRow({ apiKey, usage, isDefault, onOpenActions }: KeyRowProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const limit = apiKey.monthlyTokenLimit;
  const used = usage ? usage.promptTokens + usage.completionTokens : 0;
  const reached = usage?.limitReached ?? false;
  const ratio = limit && limit > 0 ? Math.min(1, used / limit) : 0;
  const nearing = limit !== null && !reached && ratio >= NEARING_LIMIT_RATIO;

  return (
    <Pressable
      style={[styles.keyRow, reached && styles.keyRowPaused]}
      onPress={onOpenActions}
      testID={`llm-key-${apiKey.provider}`}
    >
      <View style={styles.textColumn}>
        <View style={styles.keyProviderLine}>
          <Text style={styles.keyProvider}>
            {LLM_PROVIDER_LABEL[apiKey.provider] ?? apiKey.provider}
            {isDefault ? t('ai.default') : ''}
          </Text>
          {reached && (
            <View style={styles.badgeDanger}>
              <Text style={styles.badgeDangerText}>{t('ai.limitPaused')}</Text>
            </View>
          )}
          {nearing && (
            <View style={styles.badgeWarn}>
              <Text style={styles.badgeWarnText}>
                {t('ai.limitPercentUsed', { percent: Math.round(ratio * 100) })}
              </Text>
            </View>
          )}
        </View>
        {apiKey.model ? <Text style={styles.keyMeta}>{apiKey.model}</Text> : null}

        {limit !== null && (
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                { width: `${ratio * 100}%` },
                reached ? styles.meterFillDanger : nearing ? styles.meterFillWarn : null,
              ]}
            />
          </View>
        )}

        {usage && (
          <Text style={styles.keyUsage}>
            {[
              limit === null
                ? t('ai.usageThisMonth')
                : t('ai.limitUsage', { used: formatNumber(used), limit: formatNumber(limit) }),
              t('ai.usageRequests', { count: usage.requestCount }),
              ...(limit === null ? [t('ai.usageTokens', { count: formatNumber(used) })] : []),
              t('ai.usageLastUsed', { date: new Date(usage.lastUsedAt).toLocaleDateString() }),
            ].join(' · ')}
          </Text>
        )}

        {reached && (
          <Text style={styles.keyReachedText}>
            {t('ai.limitReachedRow', { date: nextResetLabel() })}
          </Text>
        )}
      </View>

      <Pressable
        style={styles.actionsButton}
        onPress={onOpenActions}
        testID={`llm-key-actions-${apiKey.provider}`}
        accessibilityLabel={t('ai.actions')}
        hitSlop={8}
      >
        <MoreIcon color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

interface ActionsSheetProps {
  apiKey: LlmApiKey;
  isDefault: boolean;
  busy: boolean;
  onClose: () => void;
  onTest: () => void;
  onMakeDefault: () => void;
  onEditLimit: () => void;
  onDelete: () => void;
}

function ActionsSheet({
  apiKey,
  isDefault,
  busy,
  onClose,
  onTest,
  onMakeDefault,
  onEditLimit,
  onDelete,
}: ActionsSheetProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} testID="llm-key-actions-backdrop" />
      <View style={styles.sheetContainer}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {t('ai.keyActionsTitle', {
              provider: LLM_PROVIDER_LABEL[apiKey.provider] ?? apiKey.provider,
            })}
          </Text>

          <Pressable
            style={styles.sheetRow}
            onPress={onEditLimit}
            disabled={busy}
            testID={`sheet-limit-${apiKey.provider}`}
          >
            <Text style={styles.sheetRowText}>
              {apiKey.monthlyTokenLimit === null ? t('ai.setLimit') : t('ai.editLimit')}
            </Text>
          </Pressable>

          <Pressable
            style={styles.sheetRow}
            onPress={onTest}
            disabled={busy}
            testID={`sheet-test-${apiKey.provider}`}
          >
            <Text style={styles.sheetRowText}>{t('ai.test')}</Text>
          </Pressable>

          {!isDefault && (
            <Pressable
              style={styles.sheetRow}
              onPress={onMakeDefault}
              disabled={busy}
              testID={`sheet-make-default-${apiKey.provider}`}
            >
              <Text style={styles.sheetRowText}>{t('ai.makeDefault')}</Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.sheetRow, styles.sheetRowLast]}
            onPress={onDelete}
            disabled={busy}
            testID={`sheet-delete-${apiKey.provider}`}
          >
            <Text style={styles.sheetRowTextDanger}>{t('ai.delete')}</Text>
          </Pressable>

          <Pressable style={styles.sheetCancel} onPress={onClose} testID="sheet-cancel">
            <Text style={styles.sheetCancelText}>{t('ai.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface LimitEditorSheetProps {
  apiKey: LlmApiKey;
  used: number;
  atCeiling: boolean;
  onClose: () => void;
  onSave: (monthlyTokenLimit: number | null) => Promise<void>;
}

function LimitEditorSheet({ apiKey, used, atCeiling, onClose, onSave }: LimitEditorSheetProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState(
    apiKey.monthlyTokenLimit === null ? '' : String(apiKey.monthlyTokenLimit),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const persist = async (limit: number | null) => {
    setError(null);
    setSaving(true);
    try {
      await onSave(limit);
    } catch {
      setError(t('ai.limitUpdateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const trimmed = value.replace(/[\s,]/g, '');
    if (trimmed === '') return persist(null);
    if (!/^\d+$/.test(trimmed)) return setError(t('ai.limitMustBeWholeNumber'));
    const parsed = Number(trimmed);
    if (parsed < 1) return setError(t('ai.limitMustBePositive'));
    return persist(parsed);
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} testID="limit-editor-backdrop" />
      <View style={styles.sheetContainer}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('ai.monthlyLimitLabel')}</Text>

            {atCeiling && (
              <Text style={styles.limitAtCeilingText}>
                {t('ai.limitAtCeiling', { limit: formatNumber(apiKey.monthlyTokenLimit ?? 0) })}
              </Text>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              placeholder={t('ai.removeLimit')}
              testID="limit-input"
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow}>
              {PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  style={styles.presetChip}
                  onPress={() => setValue(String(preset))}
                  testID={`limit-preset-${preset}`}
                >
                  <Text style={styles.presetChipText}>{formatNumber(preset)}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.presetChip}
                onPress={() => setValue('')}
                testID="limit-preset-none"
              >
                <Text style={styles.presetChipText}>{t('ai.removeLimit')}</Text>
              </Pressable>
            </ScrollView>

            <Text style={styles.limitHelpText}>
              {t('ai.limitHelp')} {t('ai.limitUsedSoFar', { used: formatNumber(used) })}
            </Text>

            <View style={styles.formActions}>
              <Pressable
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={submit}
                disabled={saving}
                testID="save-limit-button"
              >
                <Text style={styles.saveButtonText}>
                  {atCeiling ? t('ai.raiseLimitAndResume') : t('ai.saveLimit')}
                </Text>
              </Pressable>
              <Pressable style={styles.testButton} onPress={onClose} testID="cancel-limit-button">
                <Text style={styles.testButtonText}>{t('ai.cancelLimit')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

interface AddProviderModalProps {
  provider: string;
  onChangeProvider: (provider: string) => void;
  apiKeyValue: string;
  onChangeApiKeyValue: (value: string) => void;
  model: string;
  onChangeModel: (value: string) => void;
  baseUrl: string;
  onChangeBaseUrl: (value: string) => void;
  formError: string | null;
  testResult: string | null;
  testing: boolean;
  saving: boolean;
  onTest: () => void;
  onSave: () => void;
  onClose: () => void;
}

function AddProviderModal({
  provider,
  onChangeProvider,
  apiKeyValue,
  onChangeApiKeyValue,
  model,
  onChangeModel,
  baseUrl,
  onChangeBaseUrl,
  formError,
  testResult,
  testing,
  saving,
  onTest,
  onSave,
  onClose,
}: AddProviderModalProps) {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} testID="add-provider-backdrop" />
      <View style={styles.sheetContainer}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.addProviderHeader}>
              <Text style={styles.addProviderTitle}>{t('ai.addProvider')}</Text>
              <Pressable onPress={onClose} testID="close-add-provider-button">
                <Text style={styles.formModalCloseText}>{t('ai.close')}</Text>
              </Pressable>
            </View>

            <View style={styles.addProviderContent}>
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              {testResult ? <Text style={styles.testResult}>{testResult}</Text> : null}

              <Text style={styles.fieldLabel}>{t('ai.providerLabel')}</Text>
              <ProviderPicker value={provider} onChange={onChangeProvider} />

              <TextInput
                style={styles.input}
                placeholder={t('ai.apiKeyPlaceholder')}
                value={apiKeyValue}
                onChangeText={onChangeApiKeyValue}
                secureTextEntry
                autoCapitalize="none"
                testID="llm-api-key-input"
              />
              <TextInput
                style={styles.input}
                placeholder={t('ai.modelPlaceholder')}
                value={model}
                onChangeText={onChangeModel}
                autoCapitalize="none"
                testID="llm-model-input"
              />
              {provider === 'custom' ? (
                <TextInput
                  style={styles.input}
                  placeholder={t('ai.baseUrlPlaceholder')}
                  value={baseUrl}
                  onChangeText={onChangeBaseUrl}
                  autoCapitalize="none"
                  testID="llm-base-url-input"
                />
              ) : null}

              <View style={styles.formActions}>
                <Pressable
                  style={styles.testButton}
                  onPress={onTest}
                  disabled={testing}
                  testID="test-llm-key-button"
                >
                  <Text style={styles.testButtonText}>
                    {testing ? t('ai.testing') : t('ai.test')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={onSave}
                  disabled={saving}
                  testID="save-llm-key-button"
                >
                  <Text style={styles.saveButtonText}>
                    {saving ? t('ai.saving') : t('ai.save')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function AiSettingsScreen() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { data, isLoading, isError, error } = useLlmApiKeys();
  const { data: usageSummary } = useLlmUsageSummary();
  const saveKey = useSaveLlmApiKey();
  const deleteKey = useDeleteLlmApiKey();
  const setDefault = useSetDefaultLlmProvider();
  const testKey = useTestLlmApiKey();
  const setMonthlyLimit = useSetLlmApiKeyMonthlyLimit();
  const updateCustomAiPrompt = useUpdateCustomAiPrompt();
  const toggleFallback = useToggleFallbackWhenLimited();
  const toggleCrossAppContext = useToggleCrossApplicationContext();

  const usageByProvider = useMemo(
    () => new Map((usageSummary ?? []).map((s) => [s.provider, s])),
    [usageSummary],
  );

  const [provider, setProvider] = useState<string>(LLM_PROVIDERS[0]);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [actionsForProvider, setActionsForProvider] = useState<string | null>(null);
  const [limitEditorProvider, setLimitEditorProvider] = useState<string | null>(null);
  const [addProviderOpen, setAddProviderOpen] = useState(false);

  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [syncedCustomAiPrompt, setSyncedCustomAiPrompt] = useState<string | null>(null);
  const [customAiPromptError, setCustomAiPromptError] = useState<string | null>(null);
  const [customAiPromptSaved, setCustomAiPromptSaved] = useState(false);

  if (data && data.customAiPrompt !== syncedCustomAiPrompt) {
    setSyncedCustomAiPrompt(data.customAiPrompt);
    setCustomAiPrompt(data.customAiPrompt ?? '');
  }

  const onTest = () => {
    setFormError(null);
    setTestResult(null);
    testKey.mutate(
      {
        provider,
        apiKey: apiKeyValue || undefined,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
      },
      {
        onSuccess: (result) =>
          setTestResult(result.ok ? t('ai.keyWorks') : (result.error ?? t('ai.testFailed'))),
        onError: (err) => setFormError(getErrorMessage(err)),
      },
    );
  };

  const onSave = () => {
    setFormError(null);
    if (!apiKeyValue.trim()) {
      setFormError(t('ai.apiKeyRequired'));
      return;
    }
    saveKey.mutate(
      { provider, apiKey: apiKeyValue, model: model || undefined, baseUrl: baseUrl || undefined },
      {
        onSuccess: () => {
          setApiKeyValue('');
          setModel('');
          setBaseUrl('');
          setTestResult(null);
          setAddProviderOpen(false);
        },
        onError: (err) => setFormError(getErrorMessage(err)),
      },
    );
  };

  const closeAddProviderModal = () => {
    setAddProviderOpen(false);
    setFormError(null);
    setTestResult(null);
  };

  const onSaveCustomAiPrompt = () => {
    setCustomAiPromptError(null);
    setCustomAiPromptSaved(false);
    updateCustomAiPrompt.mutate(customAiPrompt.trim() || null, {
      onSuccess: () => setCustomAiPromptSaved(true),
      onError: (err) =>
        setCustomAiPromptError(getErrorMessage(err) || t('ai.customInstructionsFailed')),
    });
  };

  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const onToggleFallback = (checked: boolean) => {
    setFallbackError(null);
    toggleFallback.mutate(checked, {
      onError: (err) => setFallbackError(getErrorMessage(err) || t('ai.fallbackUpdateFailed')),
    });
  };

  const [crossAppContextError, setCrossAppContextError] = useState<string | null>(null);
  const onToggleCrossAppContext = (checked: boolean) => {
    setCrossAppContextError(null);
    toggleCrossAppContext.mutate(checked, {
      onError: (err) =>
        setCrossAppContextError(
          getErrorMessage(err) || t('ai.crossApplicationContextUpdateFailed'),
        ),
    });
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="ai-settings-loading" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  const keys = data?.keys ?? [];
  const actionsKey = keys.find((k) => k.provider === actionsForProvider) ?? null;
  const limitEditorKey = keys.find((k) => k.provider === limitEditorProvider) ?? null;
  const limitEditorUsage = limitEditorKey
    ? usageByProvider.get(limitEditorKey.provider)
    : undefined;
  const limitEditorUsed = limitEditorUsage
    ? limitEditorUsage.promptTokens + limitEditorUsage.completionTokens
    : 0;

  const busy = testKey.isPending || setDefault.isPending || deleteKey.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('ai.configuredProviders')}</Text>
          {keys.length === 0 ? (
            <Text style={styles.emptyText}>{t('ai.noProvidersYet')}</Text>
          ) : (
            <View style={styles.keyList}>
              {keys.map((key) => (
                <KeyRow
                  key={key.provider}
                  apiKey={key}
                  usage={usageByProvider.get(key.provider)}
                  isDefault={key.provider === data?.defaultProvider}
                  onOpenActions={() => setActionsForProvider(key.provider)}
                />
              ))}
            </View>
          )}

          <Pressable
            style={[styles.addProviderButton, styles.sectionSpacing]}
            onPress={() => setAddProviderOpen(true)}
            testID="open-add-provider-button"
          >
            <Text style={styles.addProviderButtonText}>{t('ai.addProvider')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('ai.customInstructionsTitle')}</Text>
          <Text style={styles.cardHelpText}>{t('ai.customInstructionsHelp')}</Text>
          {customAiPromptError ? <Text style={styles.error}>{customAiPromptError}</Text> : null}
          {customAiPromptSaved && !customAiPromptError ? (
            <Text style={styles.successText}>{t('ai.customInstructionsUpdated')}</Text>
          ) : null}
          <TextInput
            style={[styles.input, styles.textArea]}
            value={customAiPrompt}
            onChangeText={(text) => {
              setCustomAiPrompt(text);
              setCustomAiPromptSaved(false);
            }}
            placeholder={t('ai.customInstructionsPlaceholder')}
            multiline
            numberOfLines={3}
            testID="custom-ai-prompt-input"
          />
          <Pressable
            style={[styles.saveButton, updateCustomAiPrompt.isPending && styles.saveButtonDisabled]}
            onPress={onSaveCustomAiPrompt}
            disabled={updateCustomAiPrompt.isPending}
            testID="save-custom-ai-prompt-button"
          >
            <Text style={styles.saveButtonText}>
              {updateCustomAiPrompt.isPending ? t('ai.saving') : t('ai.saveInstructions')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchRowText}>
              <Text style={styles.switchRowTitle}>{t('ai.fallbackWhenLimitedTitle')}</Text>
              <Text style={styles.cardHelpText}>{t('ai.fallbackWhenLimitedHelp')}</Text>
            </View>
            <Switch
              value={data?.llmFallbackWhenLimited ?? false}
              onValueChange={onToggleFallback}
              disabled={toggleFallback.isPending}
              testID="fallback-when-limited-switch"
            />
          </View>
          {fallbackError ? <Text style={styles.error}>{fallbackError}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchRowText}>
              <Text style={styles.switchRowTitle}>{t('ai.crossApplicationContextTitle')}</Text>
              <Text style={styles.cardHelpText}>{t('ai.crossApplicationContextHelp')}</Text>
            </View>
            <Switch
              value={data?.useCrossApplicationContext ?? false}
              onValueChange={onToggleCrossAppContext}
              disabled={toggleCrossAppContext.isPending}
              testID="cross-application-context-switch"
            />
          </View>
          {crossAppContextError ? <Text style={styles.error}>{crossAppContextError}</Text> : null}
        </View>
      </ScrollView>

      {actionsKey && (
        <ActionsSheet
          apiKey={actionsKey}
          isDefault={actionsKey.provider === data?.defaultProvider}
          busy={busy}
          onClose={() => setActionsForProvider(null)}
          onTest={() => {
            setActionsForProvider(null);
            testKey.mutate(
              { provider: actionsKey.provider },
              {
                onError: (err) => Alert.alert(t('ai.testFailed'), getErrorMessage(err)),
              },
            );
          }}
          onMakeDefault={() => {
            setActionsForProvider(null);
            setDefault.mutate(actionsKey.provider);
          }}
          onEditLimit={() => {
            setActionsForProvider(null);
            setLimitEditorProvider(actionsKey.provider);
          }}
          onDelete={() => {
            setActionsForProvider(null);
            Alert.alert(
              t('ai.deleteKeyTitle'),
              t('ai.deleteKeyMessage', {
                provider: LLM_PROVIDER_LABEL[actionsKey.provider] ?? actionsKey.provider,
              }),
              [
                { text: t('ai.cancel'), style: 'cancel' },
                {
                  text: t('ai.delete'),
                  style: 'destructive',
                  onPress: () =>
                    deleteKey.mutate(actionsKey.provider, {
                      onError: (err) => Alert.alert(t('ai.couldNotDelete'), getErrorMessage(err)),
                    }),
                },
              ],
            );
          }}
        />
      )}

      {limitEditorKey && (
        <LimitEditorSheet
          apiKey={limitEditorKey}
          used={limitEditorUsed}
          atCeiling={limitEditorUsage?.limitReached ?? false}
          onClose={() => setLimitEditorProvider(null)}
          onSave={async (monthlyTokenLimit) => {
            await setMonthlyLimit.mutateAsync({
              provider: limitEditorKey.provider,
              monthlyTokenLimit,
            });
            setLimitEditorProvider(null);
          }}
        />
      )}

      {addProviderOpen && (
        <AddProviderModal
          provider={provider}
          onChangeProvider={setProvider}
          apiKeyValue={apiKeyValue}
          onChangeApiKeyValue={setApiKeyValue}
          model={model}
          onChangeModel={setModel}
          baseUrl={baseUrl}
          onChangeBaseUrl={setBaseUrl}
          formError={formError}
          testResult={testResult}
          testing={testKey.isPending}
          saving={saveKey.isPending}
          onTest={onTest}
          onSave={onSave}
          onClose={closeAddProviderModal}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    content: { padding: 20, gap: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 8,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    sectionSpacing: { marginTop: 16 },
    cardHelpText: { fontSize: 13, color: colors.textSubtle },
    emptyText: { fontSize: 14, color: colors.textFaint },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    successText: { fontSize: 13, color: colors.primary },
    testResult: {
      color: colors.textMuted,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
    },
    keyList: { gap: 8 },
    keyRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    keyRowPaused: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface },
    textColumn: { flex: 1, gap: 4 },
    keyProviderLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    keyProvider: { fontSize: 14, fontWeight: '600', color: colors.text },
    keyMeta: { fontSize: 12, color: colors.textFaint },
    keyUsage: { fontSize: 11, color: colors.textFaint },
    keyReachedText: { fontSize: 12, color: colors.danger },
    badgeDanger: {
      backgroundColor: colors.dangerSurface,
      borderRadius: 9999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    badgeDangerText: { fontSize: 11, fontWeight: '600', color: colors.danger },
    badgeWarn: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 9999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    badgeWarnText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    meterTrack: {
      height: 6,
      borderRadius: 9999,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      marginTop: 2,
    },
    meterFill: { height: '100%', borderRadius: 9999, backgroundColor: colors.primary },
    meterFillWarn: { backgroundColor: '#d97706' },
    meterFillDanger: { backgroundColor: colors.danger },
    actionsButton: {
      padding: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 4 },
    pickerField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    pickerFieldText: { fontSize: 15, color: colors.text },
    pickerFieldChevron: { fontSize: 15, color: colors.textFaint },
    addProviderButton: {
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addProviderButtonText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    addProviderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    addProviderTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    addProviderContent: { gap: 10 },
    formModalCloseText: { fontSize: 15, fontWeight: '600', color: colors.primary },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    formActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    testButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    testButtonText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    saveButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDisabled: { opacity: 0.6 },
    saveButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    switchRowText: { flex: 1, gap: 4 },
    switchRowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },

    // Action sheet / limit editor modals
    sheetBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      paddingBottom: 28,
      gap: 2,
    },
    sheetTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textFaint,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    sheetRow: {
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sheetRowLast: {},
    sheetRowText: { fontSize: 16, color: colors.text },
    sheetRowTextSelected: { color: colors.primary, fontWeight: '700' },
    sheetRowTextDanger: { fontSize: 16, color: colors.danger, fontWeight: '600' },
    sheetCancel: {
      marginTop: 12,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    sheetCancelText: { fontSize: 16, fontWeight: '600', color: colors.text },
    limitAtCeilingText: {
      fontSize: 12,
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 8,
      marginBottom: 8,
    },
    presetRow: { flexGrow: 0, marginTop: 8, marginBottom: 4 },
    presetChip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
    },
    presetChipText: { fontSize: 12, color: colors.textMuted },
    limitHelpText: { fontSize: 12, color: colors.textSubtle, marginTop: 4, marginBottom: 4 },
  });
}
