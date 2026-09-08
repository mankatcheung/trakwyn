import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

export function ContactsScreen() {
  const { t } = useTranslation('applications');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id: applicationId } = useLocalSearchParams<{ id: string }>();
  const { data: contacts, isLoading, isError, error } = useContacts(applicationId);
  const createContact = useCreateContact(applicationId);
  const updateContact = useUpdateContact(applicationId);
  const deleteContact = useDeleteContact(applicationId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactInput>(emptyForm());

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setForm(contactToForm(contact));
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const submit = () => {
    if (!form.name.trim()) return;
    const input = normalize(form);
    if (editingId) {
      updateContact.mutate(
        { id: editingId, input },
        {
          onSuccess: cancelForm,
          onError: (err) => Alert.alert(t('contacts.couldNotSaveTitle'), getErrorMessage(err)),
        },
      );
    } else {
      createContact.mutate(input, {
        onSuccess: cancelForm,
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

  const saving = createContact.isPending || updateContact.isPending;
  const items = contacts ?? [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {!showForm ? (
          <Pressable style={styles.addButton} onPress={startCreate} testID="add-contact-button">
            <Text style={styles.addButtonText}>{t('contacts.addContact')}</Text>
          </Pressable>
        ) : (
          <View style={styles.formCard} testID="contact-form">
            <TextInput
              style={styles.input}
              placeholder={t('contacts.nameLabel')}
              placeholderTextColor={colors.textFaint}
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
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
            <View style={styles.formActions}>
              <Pressable
                style={[styles.saveButton, (!form.name.trim() || saving) && styles.buttonDisabled]}
                onPress={submit}
                disabled={!form.name.trim() || saving}
                testID="save-contact-button"
              >
                <Text style={styles.saveButtonText}>{t('contacts.save')}</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={cancelForm}>
                <Text style={styles.cancelButtonText}>{t('detail.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {items.length === 0 && !showForm ? (
          <Text style={styles.emptyText}>{t('contacts.noContactsYet')}</Text>
        ) : null}

        {items.map((contact) =>
          editingId === contact.id ? null : (
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
                <Pressable onPress={() => startEdit(contact)} testID={`edit-contact-${contact.id}`}>
                  <Text style={styles.link}>{t('detail.edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(contact)}
                  testID={`delete-contact-${contact.id}`}
                >
                  <Text style={styles.linkDanger}>{t('detail.delete')}</Text>
                </Pressable>
              </View>
            </View>
          ),
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
    emptyText: { fontSize: 14, color: colors.textSubtle, textAlign: 'center', marginTop: 20 },
    addButton: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    addButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
    },
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
    formActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    buttonDisabled: { opacity: 0.6 },
    saveButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
    cancelButton: { paddingHorizontal: 16, paddingVertical: 10 },
    cancelButtonText: { color: colors.textSubtle, fontSize: 14, fontWeight: '600' },
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
    contactActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
    link: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    linkDanger: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  });
}
