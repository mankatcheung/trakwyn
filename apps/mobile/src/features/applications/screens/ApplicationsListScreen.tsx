import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useApplications } from '../hooks/useApplicationQueries';
import { ApplicationListItem } from '../components/ApplicationListItem';
import { statusLabel } from '../components/StatusBadge';
import { BoardScreen } from './BoardScreen';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';

type StatusFilter = 'all' | ApplicationStatus;
type ViewMode = 'list' | 'board';

function matchesSearch(application: Application, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return (
    application.company.toLowerCase().includes(needle) ||
    application.role.toLowerCase().includes(needle)
  );
}

export function ApplicationsListScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { data, isLoading, isError, error, refetch, isRefetching } = useApplications(
    statusFilter === 'all' ? undefined : statusFilter,
  );

  const applications = useMemo(
    () => (data ?? []).filter((application) => matchesSearch(application, search)),
    [data, search],
  );

  return (
    <View style={styles.container}>
      <View style={styles.viewToggle} testID="applications-view-toggle">
        <Pressable
          style={[styles.viewToggleOption, viewMode === 'list' && styles.viewToggleOptionActive]}
          onPress={() => setViewMode('list')}
          testID="applications-view-list"
        >
          <Text style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>
            {t('list.viewList')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.viewToggleOption, viewMode === 'board' && styles.viewToggleOptionActive]}
          onPress={() => setViewMode('board')}
          testID="applications-view-board"
        >
          <Text
            style={[styles.viewToggleText, viewMode === 'board' && styles.viewToggleTextActive]}
          >
            {t('list.viewBoard')}
          </Text>
        </Pressable>
      </View>

      {viewMode === 'board' ? (
        <BoardScreen />
      ) : (
        <>
          <TextInput
            style={styles.search}
            placeholder={t('list.searchPlaceholder')}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            testID="applications-search-input"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersScroll}
            contentContainerStyle={styles.filters}
            testID="applications-status-filters"
          >
            <FilterChip
              label={t('list.all')}
              active={statusFilter === 'all'}
              onPress={() => setStatusFilter('all')}
            />
            {APPLICATION_STATUSES.map((status) => (
              <FilterChip
                key={status}
                label={statusLabel(status)}
                active={statusFilter === status}
                onPress={() => setStatusFilter(status)}
              />
            ))}
          </ScrollView>

          {isLoading ? (
            <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
          ) : isError ? (
            <View style={styles.centered}>
              <Text style={styles.error}>{getErrorMessage(error)}</Text>
            </View>
          ) : applications.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{t('list.empty')}</Text>
            </View>
          ) : (
            <FlatList
              data={applications}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
              }
              renderItem={({ item }) => (
                <ApplicationListItem
                  application={item}
                  onPress={() => router.push(`/applications/${item.id}`)}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          <Pressable
            style={styles.fab}
            onPress={() => router.push('/applications/new')}
            testID="add-application-button"
          >
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      testID={`filter-chip-${label.toLowerCase()}`}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    viewToggle: {
      flexDirection: 'row',
      margin: 16,
      marginBottom: 0,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 3,
      alignSelf: 'flex-start',
    },
    viewToggleOption: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
    viewToggleOptionActive: { backgroundColor: colors.surface },
    viewToggleText: { fontSize: 13, color: colors.textSubtle, fontWeight: '500' },
    viewToggleTextActive: { color: colors.text, fontWeight: '700' },
    search: {
      margin: 16,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    filtersScroll: { flexGrow: 0, flexShrink: 0, height: 36, marginBottom: 12 },
    filters: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    chip: {
      borderRadius: 9999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      paddingHorizontal: 14,
      paddingVertical: 6,
      marginRight: 8,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
    chipTextActive: { color: colors.surface },
    list: { paddingHorizontal: 16, paddingBottom: 96 },
    separator: { height: 10 },
    loading: { marginTop: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyText: { fontSize: 14, color: colors.textSubtle },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 28,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    fabText: { color: colors.surface, fontSize: 28, lineHeight: 30, fontWeight: '400' },
  });
}
