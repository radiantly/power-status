use anyhow::{Result, bail};
use async_trait::async_trait;
use rand::random;
use std::time::Duration;
use surge_ping::{Client, Config, PingIdentifier, PingSequence};
use tapo::ApiClient;

#[async_trait]
pub(crate) trait Monitor {
    fn timeout_interval(&self) -> Duration;
    async fn get_status(&mut self) -> Result<()>;
}

pub(crate) struct TapoPowerMonitor {
    username: String,
    password: String,
    ip_addr: String,
    timeout: Duration,
}

impl TapoPowerMonitor {
    pub(crate) fn new(
        username: impl Into<String>,
        password: impl Into<String>,
        ip_addr: impl Into<String>,
        timeout: Duration,
    ) -> Self {
        TapoPowerMonitor {
            username: username.into(),
            password: password.into(),
            ip_addr: ip_addr.into(),
            timeout,
        }
    }
}

#[async_trait]
impl Monitor for TapoPowerMonitor {
    fn timeout_interval(&self) -> Duration {
        // the ApiClient has timeout built-in, so the hard timeout should typically never be required to be called
        self.timeout + Duration::from_secs(1)
    }

    async fn get_status(&mut self) -> Result<()> {
        let client = ApiClient::new(&self.username, &self.password).with_timeout(self.timeout);
        let _plug_handler = client.p110(&self.ip_addr).await?;
        Ok(())
    }
}

pub(crate) struct InternetMonitor;

impl InternetMonitor {
    pub(crate) fn new() -> Self {
        InternetMonitor {}
    }
}

#[async_trait]
impl Monitor for InternetMonitor {
    fn timeout_interval(&self) -> Duration {
        Duration::from_secs(5)
    }

    async fn get_status(&mut self) -> Result<()> {
        let client = Client::new(&Config::default())?;
        let mut pinger1 = client
            .pinger("8.8.8.8".parse()?, PingIdentifier(random()))
            .await;
        pinger1.timeout(Duration::from_secs(1));

        let mut pinger2 = client
            .pinger("1.1.1.1".parse()?, PingIdentifier(random()))
            .await;
        pinger2.timeout(Duration::from_secs(1));

        tokio::select! {
            Ok(_) = pinger1.ping(PingSequence(0), &[0; 56]) => {}
            Ok(_) = pinger2.ping(PingSequence(0), &[0; 56]) => {}
            else => bail!("failed")
        };
        Ok(())
    }
}
