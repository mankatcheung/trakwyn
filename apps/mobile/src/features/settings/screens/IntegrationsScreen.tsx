import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  useApiTokens,
  useCreateApiToken,
  useCreateShareLink,
  useDeleteApiToken,
  useDeleteShareLink,
  useMcpOAuthGrants,
  useRevokeMcpOAuthGrant,
  useShareLinks,
} from '../hooks/useIntegrations';
import { getErrorMessage } from '../../../lib/errors';
import type { ApiTokenScope, CreateApiTokenPayload, CreateShareLinkPayload } from '../types';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function IntegrationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ApiTokensSection />
      <McpGrantsSection />
      <ShareLinksSection />
    </ScrollView>
  );
}

function ApiTokensSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: tokens = [] } = useApiTokens();
  const createToken = useCreateApiToken();
  const deleteToken = useDeleteApiToken();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('read');
  const [created, setCreated] = useState<CreateApiTokenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      const token = await createToken.mutateAsync({ name: name.trim(), scope });
      setCreated(token);
      setName('');
      setScope('read');
      setFormOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.title}>{t('integrations.apiTokensTitle')}</Text>
          <Text style={styles.description}>{t('integrations.apiTokensDescription')}</Text>
        </View>
        {!formOpen && !created && (
          <Pressable onPress={() => setFormOpen(true)} testID="new-api-token-button">
            <Text style={styles.link}>{t('integrations.new')}</Text>
          </Pressable>
        )}
      </View>

      {created && (
        <View style={styles.tokenBox}>
          <Text style={styles.tokenValue} selectable testID="new-api-token-value">
            {created.token}
          </Text>
          <View style={styles.tokenActions}>
            <Pressable onPress={() => void Share.share({ message: created.token })}>
              <Text style={styles.link}>{t('integrations.share')}</Text>
            </Pressable>
            <Pressable onPress={() => setCreated(null)} testID="dismiss-new-token-button">
              <Text style={styles.link}>{t('integrations.done')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!created && formOpen && (
        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={t('integrations.apiTokenNamePlaceholder')}
            value={name}
            onChangeText={setName}
            testID="api-token-name-input"
          />
          <View style={styles.scopeRow}>
            {(['read', 'full'] as ApiTokenScope[]).map((s) => (
              <Pressable
                key={s}
                style={[styles.scopeChip, scope === s && styles.scopeChipActive]}
                onPress={() => setScope(s)}
                testID={`api-token-scope-${s}`}
              >
                <Text style={[styles.scopeChipText, scope === s && styles.scopeChipTextActive]}>
                  {s === 'read' ? t('integrations.readOnly') : t('integrations.fullAccess')}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.button}
            onPress={onCreate}
            disabled={createToken.isPending || !name.trim()}
            testID="create-api-token-button"
          >
            {createToken.isPending ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.buttonText}>{t('integrations.createToken')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {tokens.map((token) => (
        <View key={token.id} style={styles.row} testID={`api-token-${token.id}`}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              {token.name} ·{' '}
              {token.scope === 'read' ? t('integrations.readOnly') : t('integrations.fullAccess')}
            </Text>
            <Text style={styles.rowMeta}>
              {t('integrations.created', { date: formatDate(token.createdAt) })}
              {token.lastUsedAt
                ? t('integrations.lastUsed', { date: formatDate(token.lastUsedAt) })
                : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => deleteToken.mutate(token.id)}
            testID={`revoke-api-token-${token.id}`}
          >
            <Text style={styles.linkDanger}>{t('integrations.revoke')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function McpGrantsSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: grants = [], isLoading } = useMcpOAuthGrants();
  const revokeGrant = useRevokeMcpOAuthGrant();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('integrations.mcpClientsTitle')}</Text>
      <Text style={styles.description}>{t('integrations.mcpClientsDescription')}</Text>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : grants.length === 0 ? (
        <Text style={styles.emptyText}>{t('integrations.noConnectedClientsYet')}</Text>
      ) : (
        grants.map((grant) => (
          <View key={grant.id} style={styles.row} testID={`mcp-grant-${grant.id}`}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>
                {grant.clientName} ·{' '}
                {grant.scope === 'read' ? t('integrations.readOnly') : t('integrations.fullAccess')}
              </Text>
              <Text style={styles.rowMeta}>
                {t('integrations.authorized', { date: formatDate(grant.authorizedAt) })}
              </Text>
            </View>
            <Pressable
              onPress={() => revokeGrant.mutate(grant.id)}
              testID={`revoke-mcp-grant-${grant.id}`}
            >
              <Text style={styles.linkDanger}>{t('integrations.revoke')}</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

function ShareLinksSection() {
  const { t } = useTranslation('settings');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: links = [] } = useShareLinks();
  const createLink = useCreateShareLink();
  const deleteLink = useDeleteShareLink();

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreateShareLinkPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      const link = await createLink.mutateAsync(name.trim());
      setCreated(link);
      setName('');
      setFormOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.title}>{t('integrations.shareLinksTitle')}</Text>
          <Text style={styles.description}>{t('integrations.shareLinksDescription')}</Text>
        </View>
        {!formOpen && !created && (
          <Pressable onPress={() => setFormOpen(true)} testID="new-share-link-button">
            <Text style={styles.link}>{t('integrations.new')}</Text>
          </Pressable>
        )}
      </View>

      {created && (
        <View style={styles.tokenBox}>
          <Text style={styles.tokenValue} selectable testID="new-share-link-value">
            {created.token}
          </Text>
          <View style={styles.tokenActions}>
            <Pressable onPress={() => void Share.share({ message: created.token })}>
              <Text style={styles.link}>{t('integrations.share')}</Text>
            </Pressable>
            <Pressable onPress={() => setCreated(null)} testID="dismiss-new-share-link-button">
              <Text style={styles.link}>{t('integrations.done')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!created && formOpen && (
        <View style={styles.form}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={t('integrations.shareLinkNamePlaceholder')}
            value={name}
            onChangeText={setName}
            testID="share-link-name-input"
          />
          <Pressable
            style={styles.button}
            onPress={onCreate}
            disabled={createLink.isPending || !name.trim()}
            testID="create-share-link-button"
          >
            {createLink.isPending ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.buttonText}>{t('integrations.createLink')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {links.map((link) => (
        <View key={link.id} style={styles.row} testID={`share-link-${link.id}`}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{link.name}</Text>
            <Text style={styles.rowMeta}>
              {t('integrations.created', { date: formatDate(link.createdAt) })}
            </Text>
          </View>
          <Pressable
            onPress={() => deleteLink.mutate(link.id)}
            testID={`delete-share-link-${link.id}`}
          >
            <Text style={styles.linkDanger}>{t('integrations.delete')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, gap: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    cardHeaderText: { flex: 1, gap: 2 },
    title: { fontSize: 15, fontWeight: '700', color: colors.text },
    description: { fontSize: 13, color: colors.textSubtle },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
    emptyText: { fontSize: 13, color: colors.textFaint },
    form: { gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    scopeRow: { flexDirection: 'row', gap: 8 },
    scopeChip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    scopeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    scopeChipText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
    scopeChipTextActive: { color: colors.surface },
    button: {
      alignSelf: 'flex-start',
      minHeight: 40,
      borderRadius: 8,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    buttonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    error: {
      color: colors.danger,
      backgroundColor: colors.dangerSurface,
      borderRadius: 8,
      padding: 10,
      fontSize: 13,
    },
    tokenBox: { gap: 8, backgroundColor: colors.background, borderRadius: 8, padding: 12 },
    tokenValue: { fontFamily: 'monospace', fontSize: 12, color: colors.text },
    tokenActions: { flexDirection: 'row', gap: 16 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.surfaceAlt,
      paddingTop: 10,
      gap: 8,
    },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 11, color: colors.textFaint },
  });
}
