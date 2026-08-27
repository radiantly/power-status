use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Deserializer};

use crate::database::{DatabaseHandle, PatchOutcome};

pub(crate) async fn get_outages(
    State(database): State<DatabaseHandle>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match database.get_overall_status().await {
        Ok(status) => Ok(Json(status)),
        Err(error) => {
            tracing::error!("Failed to retrieve outages: {error}");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// One field of a patch, to be paired with `#[serde(default)]`.
///
/// A patch field is three-way: absent keeps what is stored, null erases it, and
/// a value replaces it. `Option<Option<T>>` has room for all three, but the
/// type alone does not get them -- deserializing it straight from a null yields
/// `None`, the same as absent, and a note would become impossible to remove
/// once written. Serde calls this only when the key is present, which is what
/// separates the two.
fn patch_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(deserializer).map(Some)
}

/// Absent fields are left as they are; an explicit null clears one. See
/// [`patch_field`] for why the two cannot be the same thing.
#[derive(Deserialize)]
pub(crate) struct OutageInfoPatch {
    #[serde(default, deserialize_with = "patch_field")]
    excluded: Option<Option<bool>>,
    #[serde(default, deserialize_with = "patch_field")]
    notes: Option<Option<String>>,
}

impl OutageInfoPatch {
    /// Whether the patch asks for nothing at all.
    fn is_empty(&self) -> bool {
        self.excluded.is_none() && self.notes.is_none()
    }
}

pub(crate) async fn patch_outage_info(
    State(database): State<DatabaseHandle>,
    Path((monitor_id, start)): Path<(String, i64)>,
    Json(patch): Json<OutageInfoPatch>,
) -> impl IntoResponse {
    // A patch that sets nothing has nothing to write, so it never reaches the
    // database -- which is what lets the page use one as a password check. The
    // auth layer has already run by this point, so a 204 here says the
    // credential was accepted and says nothing about the outage named in the
    // path, which is never looked up.
    if patch.is_empty() {
        return StatusCode::NO_CONTENT;
    }

    match database
        .patch_outage_info(monitor_id, start, patch.excluded, patch.notes)
        .await
    {
        Ok(PatchOutcome::Updated) => StatusCode::NO_CONTENT,
        Ok(PatchOutcome::OutageNotFound) => StatusCode::NOT_FOUND,
        Err(error) => {
            tracing::error!("Failed to patch outage info: {error}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
