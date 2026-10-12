use async_graphql::SimpleObject;

/// Where a client uploads a file directly, and the key to confirm it with.
#[derive(SimpleObject)]
#[graphql(name = "UploadUrlPayload")]
pub struct UploadUrlPayloadObject {
    pub upload_url: Option<String>,
    pub storage_key: Option<String>,
}
