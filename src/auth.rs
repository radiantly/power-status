use axum::{
    extract::Request,
    http::{StatusCode, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};

use crate::config::ADMIN_PASSWORD;

pub(crate) async fn require_admin_password(
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let presented = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .and_then(|header| header.strip_prefix("Bearer "));

    match presented {
        Some(token) if token == ADMIN_PASSWORD => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
