import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../theme/colors';

/** Shared bottom-sheet chrome (backdrop, sheet card, list rows, cancel
 * button) used by every Modal-based picker/actions sheet across the app —
 * extracted from AiSettingsScreen's original ProviderPicker/ActionsSheet so
 * new sheets (e.g. ConversationProviderPicker) reuse it instead of
 * re-deriving the same values. */
export function createSheetStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    sheetRowText: { fontSize: 16, color: colors.text },
    sheetRowTextSelected: { color: colors.primary, fontWeight: '700' },
    sheetRowMeta: { fontSize: 13, color: colors.textSubtle, marginTop: 2 },
    sheetCancel: {
      marginTop: 12,
      paddingVertical: 14,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    sheetCancelText: { fontSize: 16, fontWeight: '600', color: colors.text },
  });
}
