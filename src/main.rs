use axum::{
    Router,
    routing::{get, patch},
};
use monitor::Monitor;
use std::time::Duration;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    config::{
        DB_BACKUP_PATH, DB_PATH, SFTP_PRIVATE_KEY, SFTP_SERVER, SFTP_SERVER_FINGERPRINT,
        SFTP_SERVER_FINGERPRINT_ALGO, SFTP_USERNAME, TAPO_PASSWORD, TAPO_PLUG_IP, TAPO_USERNAME,
    },
    database::DatabaseHandle,
    monitor::{BackupMonitor, InternetMonitor, TapoPowerMonitor},
};
use tokio::time::{Instant, sleep};
mod config;
mod database;
mod monitor;
mod routes;
mod sftp;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env())
        .init();

    let database = DatabaseHandle::new(DB_PATH)?;

    let tapo_power = TapoPowerMonitor::new(
        TAPO_USERNAME,
        TAPO_PASSWORD,
        TAPO_PLUG_IP,
        Duration::from_secs(5),
    );

    let internet = InternetMonitor::default();

    let backup = BackupMonitor::new(
        database.clone(),
        DB_BACKUP_PATH,
        SFTP_SERVER,
        SFTP_SERVER_FINGERPRINT,
        SFTP_SERVER_FINGERPRINT_ALGO,
        SFTP_USERNAME,
        SFTP_PRIVATE_KEY,
    )?;

    let monitors: Vec<(&'static str, Box<dyn Monitor + Send>, Duration)> = vec![
        ("power", Box::new(tapo_power), Duration::from_secs(10)),
        ("internet", Box::new(internet), Duration::from_secs(10)),
        ("backup", Box::new(backup), Duration::from_hours(1)),
    ];

    for (monitor_id, mut monitor, interval) in monitors.into_iter() {
        let database = database.clone();
        tokio::spawn(async move {
            loop {
                let start_time = Instant::now();
                let timeout = monitor.timeout_interval();
                let up = tokio::select! {
                    result = monitor.get_status() => {
                        result.map_err(|e| tracing::debug!("Monitor down: {e}")).is_ok()
                    },
                    _ = sleep(timeout) => false
                };
                if let Err(e) = database
                    .update_status(monitor_id, up, (timeout + interval).as_secs() as i64)
                    .await
                {
                    tracing::error!("Failed to update db with status: {e}")
                }
                let elapsed = start_time.elapsed();
                if elapsed < interval {
                    sleep(interval - elapsed).await;
                }
            }
        });
    }

    let api_routes = Router::new()
        .route("/status", get(routes::get_outages))
        .route(
            "/monitors/{monitor_id}/outages/{start}",
            patch(routes::patch_outage_info),
        )
        .with_state(database);

    let app = Router::new().nest("/api", api_routes);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    axum::serve(listener, app).await?;

    Ok(())
}
