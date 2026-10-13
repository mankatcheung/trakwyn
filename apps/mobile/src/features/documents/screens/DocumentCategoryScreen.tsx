import React, { useState, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../hooks/useDocumentQueries';
import { useDeleteDocument } from '../hooks/useDeleteDocument';
import { useUploadDocument, type UploadDocumentInput } from '../hooks/useUploadDocument';
import { useDocumentDrafts } from '../hooks/useDocumentDraftQueries';
import { useDeleteDocumentDraft } from '../hooks/useDeleteDocumentDraft';
import {
  documentCategory,
  UPLOAD_TYPES_BY_CATEGORY,
  type DocumentCategory,
} from '../lib/documentCategory';
import {
  buildListItems,
  countItems,
  effectiveFilter,
  filterItems,
  type ListFilter,
} from '../lib/documentListItems';
import { DraftCard, FileCard } from '../components/DocumentCards';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { PlusIcon, UploadIcon } from '../../applications/components/ApplicationIcons';

/**
 * Cover letters and Resumes each have their own create-draft screen, so the
 * type is never asked for; Other documents is upload-only. The routes are
 * flat siblings of this one, like `./documents/<id>`, so a bare relative push
 * resolves against `[id]/` (JEF-310).
 */
const NEW_DRAFT_ROUTE: Partial<Record<DocumentCategory, string>> = {
  cover_letter: './new-cover-letter',
  resume: './new-resume',
};

const EMPTY_TEXT_KEY: Record<DocumentCategory, string> = {
  cover_letter: 'emptyCoverLetters',
  resume: 'emptyResumes',
  other: 'emptyOther',
};

const FILTERS: readonly { id: ListFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'filterAll' },
  { id: 'drafts', labelKey: 'filterDrafts' },
  { id: 'files', labelKey: 'filterFiles' },
];

interface DocumentCategoryScreenProps {
  /** Only this category's drafts and uploads are shown — no screen overlaps another. */
  category: DocumentCategory;
}

export function DocumentCategoryScreen({ category }: DocumentCategoryScreenProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: allDocuments, isLoading, isError, error } = useDocuments(applicationId);
  const { data: allDrafts } = useDocumentDrafts(applicationId);
  const uploadDocument = useUploadDocument(applicationId);
  const deleteDocument = useDeleteDocument(applicationId);
  const deleteDraft = useDeleteDocumentDraft(applicationId);
  const [filter, setFilter] = useState<ListFilter>('all');

  const allowedTypes = UPLOAD_TYPES_BY_CATEGORY[category];
  const documents = useMemo(
    () => (allDocuments ?? []).filter((d) => documentCategory(d.documentType) === category),
    [allDocuments, category],
  );
  const drafts = useMemo(
    () => (allDrafts ?? []).filter((d) => documentCategory(d.type) === category),
    [allDrafts, category],
  );

  const [pending, setPending] = useState<UploadDocumentInput | null>(null);
  const [documentType, setDocumentType] = useState<string>(allowedTypes[0]);
  const [version, setVersion] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);

  const onPick = async () => {
    setPickError(null);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setPending({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      sizeBytes: asset.size ?? 0,
      documentType: allowedTypes[0],
    });
    setDocumentType(allowedTypes[0]);
    setVersion('');
  };

  const onConfirm = () => {
    if (!pending) return;
    uploadDocument.mutate(
      { ...pending, documentType, version: version.trim() || undefined },
      {
        onSuccess: () => setPending(null),
        onError: (err) => setPickError(getErrorMessage(err)),
      },
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="documents-loading" />
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

  const newDraftRoute = NEW_DRAFT_ROUTE[category];
  const matchApplicationId = category === 'resume' ? applicationId : undefined;
  const items = buildListItems(drafts, documents);
  const counts = countItems(items);
  const activeFilter = effectiveFilter(filter, counts);
  const visible = filterItems(items, activeFilter);

  const listHeader = (
    <View>
      {counts.drafts > 0 && counts.files > 0 ? (
        <View style={styles.filterRow} accessibilityRole="tablist">
          {FILTERS.map(({ id, labelKey }) => (
            <Pressable
              key={id}
              style={[styles.filterTab, activeFilter === id && styles.filterTabActive]}
              onPress={() => setFilter(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeFilter === id }}
              testID={`filter-${id}`}
            >
              <Text
                numberOfLines={1}
                style={[styles.filterText, activeFilter === id && styles.filterTextActive]}
              >
                {t(labelKey)} {counts[id]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {pickError ? <Text style={styles.error}>{pickError}</Text> : null}

      {pending ? (
        <View style={styles.pendingCard}>
          <Text style={styles.name} numberOfLines={1}>
            {pending.name}
          </Text>
          {allowedTypes.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
              {allowedTypes.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.typeChip, documentType === type && styles.typeChipActive]}
                  onPress={() => setDocumentType(type)}
                  testID={`document-type-${type}`}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      documentType === type && styles.typeChipTextActive,
                    ]}
                  >
                    {t(type)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <TextInput
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            placeholder={t('versionPlaceholder')}
            value={version}
            onChangeText={setVersion}
            testID="document-version-input"
          />
          <View style={styles.rowActions}>
            <Pressable
              style={[styles.confirmButton, uploadDocument.isPending && styles.disabled]}
              onPress={onConfirm}
              disabled={uploadDocument.isPending}
              testID="confirm-upload-button"
            >
              <Text style={styles.confirmButtonText}>
                {uploadDocument.isPending ? t('uploading') : t('upload')}
              </Text>
            </Pressable>
            <Pressable onPress={() => setPending(null)} disabled={uploadDocument.isPending}>
              <Text style={styles.linkMuted}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={visible}
        keyExtractor={(item) => item.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<Text style={styles.emptyText}>{t(EMPTY_TEXT_KEY[category])}</Text>}
        renderItem={({ item }) =>
          item.kind === 'draft' ? (
            <DraftCard
              draft={item.draft}
              matchApplicationId={matchApplicationId}
              onDelete={() =>
                deleteDraft.mutate(item.id, {
                  onError: (err) => Alert.alert(t('deleteFailed'), getErrorMessage(err)),
                })
              }
            />
          ) : (
            <FileCard
              document={item.document}
              showTypeBadge={category === 'other' && item.document.documentType === 'portfolio'}
              matchApplicationId={matchApplicationId}
              onDelete={() =>
                deleteDocument.mutate(item.id, {
                  onError: (err) => Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
                })
              }
            />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={styles.fabs} pointerEvents="box-none">
        {pending ? null : (
          <Pressable
            style={styles.uploadFab}
            onPress={() => void onPick()}
            accessibilityRole="button"
            testID="pick-document-button"
          >
            <UploadIcon color={colors.text} size={16} />
            <Text style={styles.uploadFabText}>{t('uploadFile')}</Text>
          </Pressable>
        )}
        {newDraftRoute ? (
          <Pressable
            style={styles.newDraftFab}
            onPress={() => router.push(newDraftRoute as never)}
            accessibilityRole="button"
            testID="new-draft-button"
          >
            <PlusIcon color={colors.onPrimary} size={18} />
            <Text style={styles.newDraftFabText}>{t('newDraft')}</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      margin: 16,
      marginBottom: 0,
      fontSize: 14,
    },
    list: { padding: 16, paddingBottom: 96 },
    separator: { height: 10 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    filterRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      padding: 3,
      marginBottom: 12,
    },
    filterTab: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 4,
      minHeight: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterTabActive: { backgroundColor: colors.surface },
    filterText: { fontSize: 13, color: colors.textMuted },
    filterTextActive: { fontWeight: '700', color: colors.text },
    fabs: { position: 'absolute', right: 16, bottom: 24, alignItems: 'flex-end', gap: 10 },
    uploadFab: {
      minHeight: 44,
      borderRadius: 9999,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      elevation: 3,
    },
    uploadFabText: { fontSize: 14, fontWeight: '600', color: colors.text },
    newDraftFab: {
      minHeight: 52,
      borderRadius: 9999,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      elevation: 4,
    },
    newDraftFabText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
    pendingCard: {
      marginVertical: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primarySurface,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    typeRow: { flexGrow: 0 },
    typeChip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 12,
      paddingVertical: 5,
      marginRight: 8,
      backgroundColor: colors.surface,
    },
    typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
    typeChipTextActive: { color: colors.onPrimary },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      backgroundColor: colors.surface,
    },
    rowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    confirmButton: {
      minHeight: 40,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.6 },
    confirmButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' },
    name: { fontSize: 14, fontWeight: '600', color: colors.text },
    linkMuted: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
  });
}
