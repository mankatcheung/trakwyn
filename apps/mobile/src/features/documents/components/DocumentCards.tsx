import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fileExtension } from '../lib/documentListItems';
import type { Document, DocumentDraftSummary } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import {
  FileIcon,
  MoreVerticalIcon,
  PencilIcon,
} from '../../applications/components/ApplicationIcons';
import { ResumeMatchPanel } from '../../applications/components/ResumeMatchPanel';
import { ResumeAtsPanel } from '../../applications/components/ResumeAtsPanel';

interface CardShellProps {
  kind: 'draft' | 'file';
  title: string;
  badges: React.ReactNode;
  meta: string;
  /** Wraps the tile and text, which are what opens the item; the menu and the match bar keep their own taps. */
  wrapHeader: (content: React.ReactNode) => React.ReactElement;
  onMenu: () => void;
  menuTestID: string;
  /** Set on Resumes, where each resume carries its ATS check (JEF-395) and its match (JEF-397). */
  match?: {
    applicationId: string;
    resume: React.ComponentProps<typeof ResumeMatchPanel>['resume'];
    resumeId: string;
  };
}

function CardShell({
  kind,
  title,
  badges,
  meta,
  wrapHeader,
  onMenu,
  menuTestID,
  match,
}: CardShellProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDraft = kind === 'draft';
  const Icon = isDraft ? PencilIcon : FileIcon;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {wrapHeader(
          <>
            <View style={[styles.tile, isDraft ? styles.tileDraft : styles.tileFile]}>
              <Icon color={isDraft ? colors.primary : colors.textSubtle} size={20} />
            </View>
            <View style={styles.textColumn}>
              <Text style={styles.name} numberOfLines={1}>
                {title}
              </Text>
              <View style={styles.metaRow}>
                {badges}
                <Text style={styles.meta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
            </View>
          </>,
        )}
        <Pressable
          style={styles.menuButton}
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel={t('moreActions')}
          testID={menuTestID}
        >
          <MoreVerticalIcon color={colors.textSubtle} size={18} />
        </Pressable>
      </View>
      {match ? (
        <>
          <ResumeAtsPanel
            applicationId={match.applicationId}
            resume={match.resume}
            resumeId={match.resumeId}
          />
          <ResumeMatchPanel
            applicationId={match.applicationId}
            resume={match.resume}
            resumeId={match.resumeId}
          />
        </>
      ) : null}
    </View>
  );
}

interface DraftCardProps {
  draft: DocumentDraftSummary;
  matchApplicationId?: string;
  onDelete: () => void;
}

export function DraftCard({ draft, matchApplicationId, onDelete }: DraftCardProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const onMenu = () =>
    Alert.alert(draft.title, undefined, [
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('deleteConfirm'), draft.title, [
            { text: t('cancel'), style: 'cancel' },
            { text: t('delete'), style: 'destructive', onPress: onDelete },
          ]),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);

  return (
    <CardShell
      kind="draft"
      title={draft.title}
      badges={<Text style={[styles.badge, styles.badgeDraft]}>{t('draftBadge')}</Text>}
      meta={t('editedOn', { date: new Date(draft.updatedAt).toLocaleDateString() })}
      wrapHeader={(content) => (
        <Link href={`./documents/${draft.id}`} asChild>
          <Pressable
            style={styles.headerPress}
            testID={`draft-${draft.id}`}
            accessibilityRole="link"
          >
            {content}
          </Pressable>
        </Link>
      )}
      onMenu={onMenu}
      menuTestID={`draft-actions-${draft.id}`}
      match={
        matchApplicationId
          ? {
              applicationId: matchApplicationId,
              resume: { documentDraftId: draft.id },
              resumeId: draft.id,
            }
          : undefined
      }
    />
  );
}

interface FileCardProps {
  document: Document;
  /** Other mixes types, so a portfolio file says so; the other screens do not. */
  showTypeBadge: boolean;
  matchApplicationId?: string;
  onDelete: () => void;
}

export function FileCard({ document, showTypeBadge, matchApplicationId, onDelete }: FileCardProps) {
  const { t } = useTranslation('documents');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const extension = fileExtension(document.name, document.mimeType);
  const open = () => void Linking.openURL(document.url);

  const onMenu = () =>
    Alert.alert(document.name, undefined, [
      { text: t('openFile'), onPress: open },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            t('deleteDocumentTitle'),
            t('deleteDocumentMessage', { name: document.name }),
            [
              { text: t('cancel'), style: 'cancel' },
              { text: t('delete'), style: 'destructive', onPress: onDelete },
            ],
          ),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);

  const meta = [
    t('uploadedOn', { date: new Date(document.createdAt).toLocaleDateString() }),
    `${(document.sizeBytes / 1024).toFixed(1)} KB`,
    ...(document.version ? [document.version] : []),
  ].join(' · ');

  return (
    <CardShell
      kind="file"
      title={document.name}
      badges={
        <>
          {extension ? <Text style={[styles.badge, styles.badgeFile]}>{extension}</Text> : null}
          {showTypeBadge ? (
            <Text style={[styles.badge, styles.badgeType]}>{t(document.documentType)}</Text>
          ) : null}
        </>
      }
      meta={meta}
      wrapHeader={(content) => (
        <Pressable
          style={styles.headerPress}
          onPress={open}
          accessibilityRole="link"
          testID={`document-${document.id}`}
        >
          {content}
        </Pressable>
      )}
      onMenu={onMenu}
      menuTestID={`document-actions-${document.id}`}
      match={
        matchApplicationId
          ? {
              applicationId: matchApplicationId,
              resume: { documentId: document.id },
              resumeId: document.id,
            }
          : undefined
      }
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    header: { flexDirection: 'row', alignItems: 'center' },
    headerPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
    tile: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileDraft: { backgroundColor: colors.primarySurface },
    tileFile: { backgroundColor: colors.surfaceAlt },
    textColumn: { flex: 1, gap: 3 },
    name: { fontSize: 15, fontWeight: '600', color: colors.text },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    meta: { flexShrink: 1, fontSize: 12, color: colors.textSubtle },
    menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    badge: {
      fontSize: 10,
      fontWeight: '700',
      borderRadius: 9999,
      paddingHorizontal: 7,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    badgeDraft: {
      color: colors.primary,
      backgroundColor: colors.primarySurface,
      textTransform: 'uppercase',
    },
    badgeFile: {
      color: colors.textMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    badgeType: {
      color: colors.success,
      backgroundColor: colors.successSurface,
      textTransform: 'capitalize',
    },
  });
}
