import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import { useApplications } from '../hooks/useApplicationQueries';
import { ApplicationListItem } from '../components/ApplicationListItem';
import { ApplicationDisplayFieldsPicker } from '../components/ApplicationDisplayFieldsPicker';
import { StatusFilterButton } from '../components/StatusFilterButton';
import { GhostIcon, SearchIcon, StarIcon, TrashIcon } from '../components/ApplicationIcons';
import { BoardScreen } from './BoardScreen';
import type { Application, ApplicationStatus } from '../types';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { useApplicationDisplayFields } from '../lib/applicationDisplayFields';

type StatusFilter = 'all' | ApplicationStatus;
type ViewMode = 'list' | 'board';

// The starred/ghosted filter pills keep the same fill in both themes, so the
// icon sitting on them needs a fixed dark tone — it was `colors.surface`, i.e.
// white on gold (1.9:1) in light mode and dark-slate on amber (2.6:1) in dark.
const STAR_COLOR = '#eab308';
const GHOST_COLOR = '#d97706';
const ON_FILTER_PILL_COLOR = '#111827';

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
  const [starredOnly, setStarredOnly] = useState(false);
  const [ghostedOnly, setGhostedOnly] = useState(false);
  const { fields: displayFields, toggleField: toggleDisplayField } = useApplicationDisplayFields();

  const { data, isLoading, isError, error, refetch, isRefetching } = useApplications(
    statusFilter === 'all' ? undefined : statusFilter,
  );

  const applications = useMemo(
    () =>
      (data ?? []).filter(
        (application) =>
          matchesSearch(application, search) &&
          (!starredOnly || application.starred) &&
          (!ghostedOnly || application.likelyGhosted),
      ),
    [data, search, starredOnly, ghostedOnly],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.viewToggle} testID="applications-view-toggle">
          <Pressable
            style={[styles.viewToggleOption, viewMode === 'list' && styles.viewToggleOptionActive]}
            onPress={() => setViewMode('list')}
            testID="applications-view-list"
          >
            <Text
              style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}
            >
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

        <View style={styles.headerActions}>
          <Pressable
            style={styles.trashButton}
            onPress={() => router.push('/applications/trash')}
            accessibilityLabel={t('list.trashAria')}
            testID="applications-trash-button"
          >
            <TrashIcon color={colors.textSubtle} />
          </Pressable>
          <ApplicationDisplayFieldsPicker fields={displayFields} onToggle={toggleDisplayField} />
        </View>
      </View>

      {viewMode === 'board' ? (
        <BoardScreen displayFields={displayFields} />
      ) : (
        <>
          <View style={styles.searchWrapper}>
            <SearchIcon color={colors.textFaint} />
            <TextInput
              placeholderTextColor={colors.textFaint}
              style={styles.search}
              placeholder={t('list.searchPlaceholder')}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              testID="applications-search-input"
            />
          </View>

          <View style={styles.toggleFiltersRow}>
            <Pressable
              style={[styles.toggleFilter, starredOnly && styles.toggleFilterStarredActive]}
              onPress={() => setStarredOnly((prev) => !prev)}
              accessibilityLabel={t('list.starredAria')}
              testID="applications-filter-starred"
            >
              <StarIcon
                color={starredOnly ? ON_FILTER_PILL_COLOR : STAR_COLOR}
                filled={starredOnly}
                size={15}
              />
            </Pressable>
            <Pressable
              style={[styles.toggleFilter, ghostedOnly && styles.toggleFilterGhostedActive]}
              onPress={() => setGhostedOnly((prev) => !prev)}
              accessibilityLabel={t('list.ghostedAria')}
              testID="applications-filter-ghosted"
            >
              <GhostIcon color={ghostedOnly ? ON_FILTER_PILL_COLOR : GHOST_COLOR} size={15} />
            </Pressable>
            <View style={styles.toggleFiltersSpacer} />
            <StatusFilterButton value={statusFilter} onChange={setStatusFilter} />
          </View>

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
                  displayFields={displayFields}
                />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}

          <FloatingActionButton
            onPress={() => router.push('/applications/new')}
            testID="add-application-button"
          />
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      margin: 16,
      marginBottom: 0,
    },
    viewToggle: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 3,
      alignSelf: 'flex-start',
    },
    viewToggleOption: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
    viewToggleOptionActive: { backgroundColor: colors.surface },
    viewToggleText: { fontSize: 13, color: colors.textSubtle, fontWeight: '500' },
    viewToggleTextActive: { color: colors.text, fontWeight: '700' },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    trashButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    toggleFiltersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    toggleFilter: {
      width: 40,
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    toggleFilterStarredActive: { backgroundColor: STAR_COLOR, borderColor: STAR_COLOR },
    toggleFilterGhostedActive: { backgroundColor: GHOST_COLOR, borderColor: GHOST_COLOR },
    toggleFiltersSpacer: { flex: 1 },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      margin: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
    },
    search: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    list: { paddingHorizontal: 16, paddingBottom: 96 },
    separator: { height: 12 },
    loading: { marginTop: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    emptyText: { fontSize: 14, color: colors.textSubtle },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  });
}
