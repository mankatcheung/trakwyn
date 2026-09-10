// Hand-written to match apps/web's ContactsTab.tsx GraphQL operations
// field-for-field — codegen is still deferred for apps/mobile (see JEF-261/262).

const CONTACT_FIELDS = `
  id
  applicationId
  name
  role
  email
  phone
  linkedinUrl
  notes
  createdAt
  updatedAt
`;

export const CONTACTS_QUERY = `
  query Contacts($applicationId: ID!) {
    contacts(applicationId: $applicationId) {
      ${CONTACT_FIELDS}
    }
  }
`;

export const CREATE_CONTACT_MUTATION = `
  mutation CreateContact($applicationId: ID!, $name: String!, $role: String, $email: String, $phone: String, $linkedinUrl: String, $notes: String) {
    createContact(applicationId: $applicationId, name: $name, role: $role, email: $email, phone: $phone, linkedinUrl: $linkedinUrl, notes: $notes) {
      ${CONTACT_FIELDS}
    }
  }
`;

export const UPDATE_CONTACT_MUTATION = `
  mutation UpdateContact($id: ID!, $name: String, $role: String, $email: String, $phone: String, $linkedinUrl: String, $notes: String) {
    updateContact(id: $id, name: $name, role: $role, email: $email, phone: $phone, linkedinUrl: $linkedinUrl, notes: $notes) {
      ${CONTACT_FIELDS}
    }
  }
`;

export const DELETE_CONTACT_MUTATION = `
  mutation DeleteContact($id: ID!) {
    deleteContact(id: $id)
  }
`;
