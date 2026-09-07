import React, { useState, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../hooks/useDocumentQueries';
import { useDeleteDocument } from '../hooks/useDeleteDocument';
import { useUploadDocument, type UploadDocumentInput } from '../hooks/useUploadDocument';
import type { Document } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

const DOCUMENT_TYPES = ['other', 'resume', 'cover_letter', 'portfolio'] as const;

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function DocumentRow({ document, onDelete }: { document: Document; onDelete: () => void }) {
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
        <Pressable
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
        >
          <Text style={styles.linkDanger}>{t('delete')}</Text>
        </Pressable>
      </View>
      {document.documentType !== 'other' ? (
        <Text style={styles.typeBadge}>{document.documentType.replace('_', ' ')}</Text>
      ) : null}
    </View>
  );
}

export function DocumentsScreen() {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: documents, isLoading, isError, error } = useDocuments(applicationId);
  const uploadDocument = useUploadDocument(applicationId);
  const deleteDocument = useDeleteDocument(applicationId);

  const [pending, setPending] = useState<UploadDocumentInput | null>(null);
  const [documentType, setDocumentType] = useState<string>('other');
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
      documentType: 'other',
    });
    setDocumentType('other');
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

  return (
    <View style={styles.container}>
      {pickError ? <Text style={styles.error}>{pickError}</Text> : null}

      {pending ? (
        <View style={styles.pendingCard}>
          <Text style={styles.name} numberOfLines={1}>
            {pending.name}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
            {DOCUMENT_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[styles.typeChip, documentType === type && styles.typeChipActive]}
                onPress={() => setDocumentType(type)}
                testID={`document-type-${type}`}
              >
                <Text
                  style={[styles.typeChipText, documentType === type && styles.typeChipTextActive]}
                >
                  {type.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <TextInput
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

      <FlatList
        data={documents ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('emptyText')}</Text>}
        renderItem={({ item }) => (
          <DocumentRow
            document={item}
            onDelete={() =>
              deleteDocument.mutate(item.id, {
                onError: (err) => Alert.alert(t('couldNotDeleteTitle'), getErrorMessage(err)),
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
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
    list: { padding: 16 },
    separator: { height: 10 },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    pickButton: {
      margin: 16,
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
      margin: 16,
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
    typeChipTextActive: { color: colors.surface },
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
    confirmButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
    linkMuted: { color: colors.textSubtle, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
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
