use async_graphql::{Context, MaybeUndefined, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::contact::Contact;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::contacts::{
    CreateContactInput, DeleteContactInput, GetContactsInput, UpdateContactInput,
};

/// An optional argument as a partial update reads it: left out is "do not
/// write", an explicit `null` clears the column.
pub(super) fn patch<T>(value: MaybeUndefined<T>) -> Option<Option<T>> {
    match value {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(value) => Some(Some(value)),
    }
}

#[derive(SimpleObject)]
#[graphql(name = "Contact")]
pub struct ContactObject {
    id: Option<ID>,
    application_id: Option<ID>,
    name: Option<String>,
    role: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    linkedin_url: Option<String>,
    notes: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<Contact> for ContactObject {
    fn from(contact: Contact) -> Self {
        Self {
            id: Some(ID(contact.id)),
            application_id: Some(ID(contact.application_id)),
            name: Some(contact.name),
            role: contact.role,
            email: contact.email,
            phone: contact.phone,
            linkedin_url: contact.linkedin_url,
            notes: contact.notes,
            created_at: Some(iso(contact.created_at)),
            updated_at: Some(iso(contact.updated_at)),
        }
    }
}

#[derive(Default)]
pub struct ContactsQuery;

#[Object]
impl ContactsQuery {
    async fn contacts(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<ContactObject>>> {
        let user = require_user(ctx)?;
        let contacts = container(ctx)
            .get_contacts_use_case()
            .execute(GetContactsInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        Ok(Some(contacts.into_iter().map(ContactObject::from).collect()))
    }
}

#[derive(Default)]
pub struct ContactsMutation;

#[Object]
impl ContactsMutation {
    #[allow(clippy::too_many_arguments)]
    async fn create_contact(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
        name: String,
        role: Option<String>,
        email: Option<String>,
        phone: Option<String>,
        linkedin_url: Option<String>,
        notes: Option<String>,
    ) -> Result<Option<ContactObject>> {
        let user = require_user(ctx)?;
        let contact = container(ctx)
            .create_contact_use_case()
            .execute(CreateContactInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
                name,
                role,
                email,
                phone,
                linkedin_url,
                notes,
            })
            .await
            .gql()?;
        Ok(Some(contact.into()))
    }

    // `name` cannot be cleared, so a `null` one reads as left out; every
    // other field is cleared by an explicit `null`.
    #[allow(clippy::too_many_arguments)]
    async fn update_contact(
        &self,
        ctx: &Context<'_>,
        id: ID,
        name: Option<String>,
        role: MaybeUndefined<String>,
        email: MaybeUndefined<String>,
        phone: MaybeUndefined<String>,
        linkedin_url: MaybeUndefined<String>,
        notes: MaybeUndefined<String>,
    ) -> Result<Option<ContactObject>> {
        let user = require_user(ctx)?;
        let contact = container(ctx)
            .update_contact_use_case()
            .execute(UpdateContactInput {
                user_id: user.sub.clone(),
                contact_id: id.0,
                name,
                role: patch(role),
                email: patch(email),
                phone: patch(phone),
                linkedin_url: patch(linkedin_url),
                notes: patch(notes),
            })
            .await
            .gql()?;
        Ok(Some(contact.into()))
    }

    async fn delete_contact(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_contact_use_case()
            .execute(DeleteContactInput { user_id: user.sub.clone(), contact_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
