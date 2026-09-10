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
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useContacts } from '../hooks/useContactQueries';
import { useCreateContact, useDeleteContact, useUpdateContact } from '../hooks/useContactMutations';
import { getErrorMessage } from '../../../lib/errors';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemeColors } from '../../../theme/colors';
import { PencilIcon, TrashIcon } from '../components/ApplicationIcons';
import { IconButton } from '../../../components/IconButton';
import { FloatingActionButton } from '../../../components/FloatingActionButton';
import type { Contact, ContactInput } from '../types';

function emptyForm(): ContactInput {
  return { name: '', role: '', email: '', phone: '', linkedinUrl: '', notes: '' };
}

function contactToForm(contact: Contact): ContactInput {
  return {
    name: contact.name,
    role: contact.role ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    linkedinUrl: contact.linkedinUrl ?? '',
    notes: contact.notes ?? '',
  };
}

function normalize(input: ContactInput): ContactInput {
  return {
    name: input.name.trim(),
    role: input.role?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    linkedinUrl: input.linkedinUrl?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

interface ContactFormModalProps {
  visible: boolean;
  isEditing: boolean;
  initialValue: ContactInput;
  isSaving: boolean;
  onSubmit: (input: ContactInput) => void;
  onClose: () => void;
}

function ContactFormModal({
  visible,
  isEditing,
  initialValue,
  isSaving,
  onSubmit,
  onClose,
}: ContactFormModalProps) {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = useState<ContactInput>(initialValue);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="contact-form-modal"
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} testID="contact-modal-cancel">
            <Text style={styles.linkMuted}>{t('detail.cancel')}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>
            {isEditing ? t('contacts.editContact') : t('contacts.addContact')}
          </Text>
          <Pressable
            onPress={() => onSubmit(normalize(form))}
            disabled={isSaving || !form.name.trim()}
            testID="save-contact-button"
          >
            <Text style={[styles.link, (isSaving || !form.name.trim()) && styles.linkDisabled]}>
              {t('contacts.save')}
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <TextInput
            style={styles.input}
            placeholder={t('contacts.nameLabel')}
            placeholderTextColor={colors.textFaint}
            value={form.name}
            onChangeText={(name) => setForm((f) => ({ ...f, name }))}
            autoFocus
            testID="contact-name-input"
          />
          <TextInput
            style={styles.input}
            placeholder={t('contacts.roleLabel')}
            placeholderTextColor={colors.textFaint}
            value={form.role ?? ''}
            onChangeText={(role) => setForm((f) => ({ ...f, role }))}
          />
          <TextInput
            style={styles.input}
            placeholder={t('contacts.emailLabel')}
            placeholderTextColor={colors.textFaint}
            value={form.email ?? ''}
            onChangeText={(email) => setForm((f) => ({ ...f, email }))}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder={t('contacts.phoneLabel')}
            placeholderTextColor={colors.textFaint}
            value={form.phone ?? ''}
            onChangeText={(phone) => setForm((f) => ({ ...f, phone }))}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder={t('contacts.linkedinUrlLabel')}
            placeholderTextColor={colors.textFaint}
            value={form.linkedinUrl ?? ''}
            onChangeText={(linkedinUrl) => setForm((f) => ({ ...f, linkedinUrl }))}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={t('contacts.notesLabel')}
            placeholderTextColor={colors.textFaint}
            value={form.notes ?? ''}
            onChangeText={(notes) => setForm((f) => ({ ...f, notes }))}
            multiline
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ContactsScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: contacts, isLoading, isError, error } = useContacts(applicationId);
  const createContact = useCreateContact(applicationId);
  const updateContact = useUpdateContact(applicationId);
  const deleteContact = useDeleteContact(applicationId);

  const [isAdding, setIsAdding] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const isModalVisible = isAdding || editingContact !== null;
  const saving = createContact.isPending || updateContact.isPending;

  const closeModal = () => {
    setIsAdding(false);
    setEditingContact(null);
  };

  const submit = (input: ContactInput) => {
    if (!input.name.trim()) return;
    if (editingContact) {
      updateContact.mutate(
        { id: editingContact.id, input },
        {
          onSuccess: closeModal,
          onError: (err) => Alert.alert(t('contacts.couldNotSaveTitle'), getErrorMessage(err)),
        },
      );
    } else {
      createContact.mutate(input, {
        onSuccess: closeModal,
        onError: (err) => Alert.alert(t('contacts.couldNotSaveTitle'), getErrorMessage(err)),
      });
    }
  };

  const confirmDelete = (contact: Contact) => {
    Alert.alert(t('contacts.deleteContactTitle'), t('contacts.deleteContactMessage'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('detail.delete'),
        style: 'destructive',
        onPress: () =>
          deleteContact.mutate(contact.id, {
            onError: (err) => Alert.alert(t('detail.couldNotDeleteTitle'), getErrorMessage(err)),
          }),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} testID="contacts-loading" />
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

  const items = contacts ?? [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>{t('contacts.noContactsYet')}</Text>
        ) : null}

        {items.map((contact) => (
          <View key={contact.id} style={styles.contactCard} testID={`contact-${contact.id}`}>
            <View style={styles.contactHeader}>
              <Text style={styles.contactName}>{contact.name}</Text>
              {contact.role ? (
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{contact.role}</Text>
                </View>
              ) : null}
            </View>
            {contact.email ? <Text style={styles.contactMeta}>{contact.email}</Text> : null}
            {contact.phone ? <Text style={styles.contactMeta}>{contact.phone}</Text> : null}
            {contact.linkedinUrl ? (
              <Text style={styles.contactMeta}>{contact.linkedinUrl}</Text>
            ) : null}
            {contact.notes ? <Text style={styles.contactNotes}>{contact.notes}</Text> : null}
            <View style={styles.contactActions}>
              <IconButton
                icon={PencilIcon}
                onPress={() => setEditingContact(contact)}
                testID={`edit-contact-${contact.id}`}
                accessibilityLabel={t('detail.edit')}
              />
              <IconButton
                icon={TrashIcon}
                variant="danger"
                onPress={() => confirmDelete(contact)}
                disabled={deleteContact.isPending}
                testID={`delete-contact-${contact.id}`}
                accessibilityLabel={t('detail.delete')}
              />
            </View>
          </View>
        ))}
      </ScrollView>

      <FloatingActionButton
        onPress={() => setIsAdding(true)}
        testID="add-contact-button"
        accessibilityLabel={t('contacts.addContact')}
      />

      <ContactFormModal
        key={editingContact?.id ?? (isAdding ? 'add' : 'closed')}
        visible={isModalVisible}
        isEditing={editingContact !== null}
        initialValue={editingContact ? contactToForm(editingContact) : emptyForm()}
        isSaving={saving}
        onSubmit={submit}
        onClose={closeModal}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12, paddingBottom: 96 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    input: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    contactCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 6,
    },
    contactHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    contactName: { fontSize: 15, fontWeight: '700', color: colors.text },
    roleBadge: {
      backgroundColor: colors.primarySurface,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    roleBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primary },
    contactMeta: { fontSize: 13, color: colors.textSubtle },
    contactNotes: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    contactActions: { flexDirection: 'row', gap: 4, marginTop: 6 },
    link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    linkDisabled: { color: colors.textFaint },
    linkMuted: { color: colors.textSubtle, fontSize: 15, fontWeight: '600' },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    modalContent: { padding: 16, gap: 10 },
  });
}
