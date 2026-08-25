use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;

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

#[derive(Deserialize)]
pub(crate) struct OutageInfoPatch {
    #[serde(default)]
    excluded: Option<bool>,
    #[serde(default)]
    notes: Option<String>,
}

pub(crate) async fn patch_outage_info(
    State(database): State<DatabaseHandle>,
    Path((monitor_id, start)): Path<(String, i64)>,
    Json(patch): Json<OutageInfoPatch>,
) -> impl IntoResponse {
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
