use axum::{
    Router,
    routing::{get, patch},
};
use monitor::Monitor;
use std::time::Duration;
use tracing_subscriber::FmtSubscriber;

use crate::{
    config::{TAPO_PASSWORD, TAPO_PLUG_IP, TAPO_USERNAME},
    database::DatabaseHandle,
    monitor::{InternetMonitor, TapoPowerMonitor},
};
use tokio::time::{Instant, sleep};
mod config;
mod database;
mod monitor;
mod routes;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let subscriber = FmtSubscriber::new();
    tracing::subscriber::set_global_default(subscriber)?;

    let database = DatabaseHandle::new()?;

    let tapo_power = TapoPowerMonitor::new(
        TAPO_USERNAME,
        TAPO_PASSWORD,
        TAPO_PLUG_IP,
        Duration::from_secs(5),
    );

    let internet = InternetMonitor::new();

    let monitors: Vec<(&'static str, Box<dyn Monitor + Send>, u64)> = vec![
        ("power", Box::new(tapo_power), 10),
        ("internet", Box::new(internet), 10),
    ];

    for (monitor_id, mut monitor, interval) in monitors.into_iter() {
        let database = database.clone();
        tokio::spawn(async move {
            let mut seq_num = 0;
            loop {
                let start_time = Instant::now();
                let timeout = monitor.timeout_interval();
                let up = tokio::select! {
                    result = monitor.get_status() => result.is_ok(),
                    _ = sleep(timeout) => false
                };
                if let Err(e) = database.update_status(monitor_id, up, seq_num).await {
                    tracing::error!("Failed to update db with status: {e}")
                }
                let elapsed = start_time.elapsed();
                if elapsed < Duration::from_secs(interval) {
                    sleep(Duration::from_secs(interval) - elapsed).await;
                }
                seq_num += 1;
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
