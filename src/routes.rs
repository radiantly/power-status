use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};

use crate::database::DatabaseHandle;

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
