import React, { useState, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../hooks/useDocumentQueries';
import { useDeleteDocument } from '../hooks/useDeleteDocument';
import { useUploadDocument, type UploadDocumentInput } from '../hooks/useUploadDocument';
import { useDocumentDrafts } from '../hooks/useDocumentDraftQueries';
import {
  documentCategory,
  UPLOAD_TYPES_BY_CATEGORY,
  type DocumentCategory,
} from '../lib/documentCategory';
import type { Document, DocumentDraftSummary } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { TrashIcon } from '../../applications/components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';
import { FloatingActionButton } from '../../../components/FloatingActionButton';

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

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function DraftRow({ draft }: { draft: DocumentDraftSummary }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Link href={`./documents/${draft.id}`} asChild>
      <Pressable style={styles.card} testID={`draft-${draft.id}`}>
        <Text style={styles.name} numberOfLines={1}>
          {draft.title}
        </Text>
        <Text style={styles.meta}>{new Date(draft.updatedAt).toLocaleDateString()}</Text>
      </Pressable>
    </Link>
  );
}

function DocumentRow({
  document,
  showTypeBadge,
  onDelete,
}: {
  document: Document;
  showTypeBadge: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card} testID={`document-${document.id}`}>
      <View style={styles.rowBetween}>
        <Pressable style={styles.textColumn} onPress={() => void Linking.openURL(document.url)}>
          <Text style={styles.name} numberOfLines={1}>
            {document.name}
          </Text>
          <Text style={styles.meta}>
            {document.mimeType} · {formatSize(document.sizeBytes)}
            {document.version ? ` · ${document.version}` : ''}
          </Text>
        </Pressable>
        <IconButton
          icon={TrashIcon}
          variant="danger"
          onPress={() =>
            Alert.alert(
              t('deleteDocumentTitle'),
              t('deleteDocumentMessage', { name: document.name }),
              [
                { text: t('cancel'), style: 'cancel' },
                { text: t('delete'), style: 'destructive', onPress: onDelete },
              ],
            )
          }
          testID={`delete-document-${document.id}`}
          accessibilityLabel={t('delete')}
        />
      </View>
      {showTypeBadge ? <Text style={styles.typeBadge}>{t(document.documentType)}</Text> : null}
    </View>
  );
}

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

  const listHeader = (
    <View>
      {drafts.length > 0 ? (
        <View>
          <View style={styles.draftsHeaderRow}>
            <Text style={styles.sectionTitle}>{t('draftsSectionTitle')}</Text>
          </View>
          <View style={styles.draftsList}>
            {drafts.map((draft) => (
              <DraftRow key={draft.id} draft={draft} />
            ))}
          </View>
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
      ) : (
        <Pressable
          style={styles.pickButton}
          onPress={() => void onPick()}
          testID="pick-document-button"
        >
          <Text style={styles.pickButtonText}>{t('chooseFile')}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          drafts.length === 0 ? (
            <Text style={styles.emptyText}>{t(EMPTY_TEXT_KEY[category])}</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <DocumentRow
            document={item}
            showTypeBadge={category === 'other' && item.documentType === 'portfolio'}
            onDelete={() =>
              deleteDocument.mutate(item.id, {
                onError: (err) => Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {newDraftRoute ? (
        <FloatingActionButton
          onPress={() => router.push(newDraftRoute as never)}
          testID="new-draft-button"
          accessibilityLabel={t('newDraft')}
        />
      ) : null}
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
    draftsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 16,
    },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    draftsList: { paddingTop: 10, gap: 10 },
    list: { padding: 16, paddingBottom: 96 },
    separator: { height: 10 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    pickButton: {
      marginVertical: 16,
      minHeight: 56,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    pickButtonText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
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
    linkMuted: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 6,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    textColumn: { flex: 1, gap: 2 },
    name: { fontSize: 14, fontWeight: '600', color: colors.text },
    meta: { fontSize: 12, color: colors.textSubtle },
    typeBadge: {
      alignSelf: 'flex-start',
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
      backgroundColor: colors.primarySurface,
      borderRadius: 9999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      textTransform: 'capitalize',
    },
  });
}
