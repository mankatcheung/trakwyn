import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { gqlClient } from '#/graphql/client';
import { showUndoToast } from '#/lib/undoToast';
import { useLocale } from '#/lib/i18n';
import { getErrorMessage } from '#/lib/errors';
import { useFormAction } from '#/hooks/useFormAction';
import { QuotaHint } from '#/features/quota/components/QuotaHint';
import { useQuotaState } from '#/features/quota/lib/contentQuota';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FormLabel,
  Input,
  Skeleton,
  SubmitButton,
  Textarea,
} from '@trakwyn/ui';
import { invalidateSectionCounts } from '../../lib/sectionCounts';
const CONTACTS_QUERY = `
  query Contacts($applicationId: ID!) {
    contacts(applicationId: $applicationId) { id applicationId name role email phone linkedinUrl notes createdAt updatedAt }
  }
`;
const CREATE_CONTACT = `
  mutation CreateContact($applicationId: ID!, $name: String!, $role: String, $email: String, $phone: String, $linkedinUrl: String, $notes: String) {
    createContact(applicationId: $applicationId, name: $name, role: $role, email: $email, phone: $phone, linkedinUrl: $linkedinUrl, notes: $notes) {
      id applicationId name role email phone linkedinUrl notes createdAt updatedAt
    }
  }
`;
const UPDATE_CONTACT = `
  mutation UpdateContact($id: ID!, $name: String, $role: String, $email: String, $phone: String, $linkedinUrl: String, $notes: String) {
    updateContact(id: $id, name: $name, role: $role, email: $email, phone: $phone, linkedinUrl: $linkedinUrl, notes: $notes) {
      id applicationId name role email phone linkedinUrl notes createdAt updatedAt
    }
  }
`;
const DELETE_CONTACT = `mutation DeleteContact($id: ID!) { deleteContact(id: $id) }`;

type Contact = {
  id: string;
  applicationId: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Required'),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  linkedinUrl: z.string(),
  notes: z.string(),
});

type ContactFormState = z.infer<typeof contactSchema>;

function emptyContactForm(): ContactFormState {
  return { name: '', role: '', email: '', phone: '', linkedinUrl: '', notes: '' };
}

function contactToForm(c: Contact): ContactFormState {
  return {
    name: c.name,
    role: c.role ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    linkedinUrl: c.linkedinUrl ?? '',
    notes: c.notes ?? '',
  };
}

interface ContactFormProps {
  initial: ContactFormState;
  /** Saves the contact. A rejection is shown under the form and keeps what was typed. */
  onSave: (values: ContactFormState) => Promise<unknown>;
  onCancel: () => void;
}

function ContactForm({ initial, onSave, onCancel }: ContactFormProps) {
  const { t } = useLocale();
  const form = useForm<ContactFormState>({
    resolver: zodResolver(contactSchema),
    defaultValues: initial,
  });
  const { register } = form;
  const nameError = form.formState.errors.name;

  const { state, formProps } = useFormAction(form, async (values) => {
    try {
      await onSave(values);
    } catch (error) {
      return getErrorMessage(error);
    }
  });

  return (
    <form {...formProps}>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FormLabel size="xs">{t('contacts.nameLabel')}</FormLabel>
            <Input {...register('name')} placeholder="Jane Smith" aria-invalid={!!nameError} />
            {nameError && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {nameError.message}
              </p>
            )}
          </div>
          <div>
            <FormLabel size="xs">{t('contacts.roleLabel')}</FormLabel>
            <Input {...register('role')} placeholder="Technical Recruiter" />
          </div>
          <div>
            <FormLabel size="xs">{t('contacts.emailLabel')}</FormLabel>
            <Input type="email" {...register('email')} placeholder="jane@company.com" />
          </div>
          <div>
            <FormLabel size="xs">{t('contacts.phoneLabel')}</FormLabel>
            <Input {...register('phone')} placeholder="+1 555 000 0000" />
          </div>
        </div>
        <div>
          <FormLabel size="xs">{t('contacts.linkedinUrlLabel')}</FormLabel>
          <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/in/..." />
        </div>
        <div>
          <FormLabel size="xs">{t('contacts.notesLabel')}</FormLabel>
          <Textarea
            {...register('notes')}
            className="h-20"
            placeholder={t('contacts.notesPlaceholder')}
          />
        </div>
        {state.error && <Alert>{state.error}</Alert>}
        <div className="flex justify-end gap-2">
          <SubmitButton
            size="sm"
            pendingLabel={t('applicationForm.saving')}
            aria-label={t('common.save')}
          >
            <span className="flex items-center gap-1">
              <CheckIcon size={14} /> <span className="hidden sm:inline">{t('common.save')}</span>
            </span>
          </SubmitButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            aria-label={t('common.cancel')}
          >
            <span className="flex items-center gap-1">
              <XIcon size={14} /> <span className="hidden sm:inline">{t('common.cancel')}</span>
            </span>
          </Button>
        </div>
      </Card>
    </form>
  );
}

export function ContactsTab({ applicationId }: { applicationId: string }) {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', applicationId],
    queryFn: () => gqlClient.request<{ contacts: Contact[] }>(CONTACTS_QUERY, { applicationId }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contacts', applicationId] });
    invalidateSectionCounts(qc, applicationId);
  };

  const createContact = useMutation({
    mutationFn: (f: ContactFormState) =>
      gqlClient.request(CREATE_CONTACT, {
        applicationId,
        name: f.name,
        ...(f.role ? { role: f.role } : {}),
        ...(f.email ? { email: f.email } : {}),
        ...(f.phone ? { phone: f.phone } : {}),
        ...(f.linkedinUrl ? { linkedinUrl: f.linkedinUrl } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
      }),
    onMutate: async (f) => {
      await qc.cancelQueries({ queryKey: ['contacts', applicationId] });
      const prev = qc.getQueryData<{ contacts: Contact[] }>(['contacts', applicationId]);
      const optimistic: Contact = {
        id: `__tmp_${Date.now()}`,
        applicationId,
        name: f.name,
        role: f.role || null,
        email: f.email || null,
        phone: f.phone || null,
        linkedinUrl: f.linkedinUrl || null,
        notes: f.notes || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<{ contacts: Contact[] }>(['contacts', applicationId], (old) => ({
        contacts: [...(old?.contacts ?? []), optimistic],
      }));
      return { prev };
    },
    onError: (_err, _f, context) => {
      if (context?.prev) qc.setQueryData(['contacts', applicationId], context.prev);
    },
    onSuccess: () => setShowForm(false),
    onSettled: () => invalidate(),
  });

  const updateContact = useMutation({
    mutationFn: ({ id, f }: { id: string; f: ContactFormState }) =>
      gqlClient.request(UPDATE_CONTACT, {
        id,
        name: f.name || undefined,
        role: f.role || null,
        email: f.email || null,
        phone: f.phone || null,
        linkedinUrl: f.linkedinUrl || null,
        notes: f.notes || null,
      }),
    onMutate: async ({ id, f }) => {
      await qc.cancelQueries({ queryKey: ['contacts', applicationId] });
      const prev = qc.getQueryData<{ contacts: Contact[] }>(['contacts', applicationId]);
      qc.setQueryData<{ contacts: Contact[] }>(['contacts', applicationId], (old) => ({
        contacts: (old?.contacts ?? []).map((c) =>
          c.id === id
            ? {
                ...c,
                name: f.name || c.name,
                role: f.role || null,
                email: f.email || null,
                phone: f.phone || null,
                linkedinUrl: f.linkedinUrl || null,
                notes: f.notes || null,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) qc.setQueryData(['contacts', applicationId], context.prev);
    },
    onSuccess: () => setEditingContact(null),
    onSettled: () => invalidate(),
  });

  const contacts = data?.contacts ?? [];
  const contactsFull = useQuotaState('contacts', contacts.length)?.level === 'full';

  return (
    <div className="space-y-4">
      {!showForm && !editingContact && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={contactsFull}
            onClick={() => setShowForm(true)}
            aria-label={t('contacts.addContact')}
          >
            <span className="flex items-center gap-1.5">
              <PlusIcon size={14} />{' '}
              <span className="hidden sm:inline">{t('contacts.addContact')}</span>
            </span>
          </Button>
          <QuotaHint resource="contacts" used={contacts.length} />
        </div>
      )}

      {showForm && (
        <ContactForm
          initial={emptyContactForm()}
          onSave={(values) => createContact.mutateAsync(values)}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-20 rounded-lg" />
      ) : (
        contacts.length === 0 &&
        !showForm && (
          <EmptyState size="compact" className="py-4" message={t('contacts.noContactsYet')} />
        )
      )}

      {contacts.map((contact) => (
        <Card key={contact.id} className="p-4">
          {editingContact?.id === contact.id ? (
            <ContactForm
              initial={contactToForm(contact)}
              onSave={(values) => updateContact.mutateAsync({ id: contact.id, f: values })}
              onCancel={() => setEditingContact(null)}
            />
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {contact.name}
                  </span>
                  {contact.role && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {contact.role}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:text-blue-600 hover:underline"
                    >
                      {contact.email}
                    </a>
                  )}
                  {contact.phone && <span>{contact.phone}</span>}
                  {contact.linkedinUrl && (
                    <a
                      href={contact.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 hover:underline"
                    >
                      {t('contacts.linkedinLinkText')}
                    </a>
                  )}
                </div>
                {contact.notes && (
                  <p className="mt-1 text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                    {contact.notes}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditingContact(contact)}
                  className="rounded-sm p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                >
                  <EditIcon size={14} />
                </button>
                <button
                  onClick={() => {
                    const snapshot = qc.getQueryData<{ contacts: Contact[] }>([
                      'contacts',
                      applicationId,
                    ]);
                    qc.setQueryData<{ contacts: Contact[] }>(
                      ['contacts', applicationId],
                      (prev) => ({
                        contacts: (prev?.contacts ?? []).filter((c) => c.id !== contact.id),
                      }),
                    );
                    showUndoToast({
                      message: t('contacts.contactDeletedToast'),
                      operation: { document: DELETE_CONTACT, variables: { id: contact.id } },
                      onUndo: () => qc.setQueryData(['contacts', applicationId], snapshot),
                      onSettled: invalidate,
                    });
                  }}
                  className="rounded-sm p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                >
                  <Trash2Icon size={14} />
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
