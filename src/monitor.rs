use anyhow::{Result, anyhow};
use async_trait::async_trait;
use rand::random;
use russh::keys::{Algorithm, PrivateKey, decode_secret_key, ssh_key::Fingerprint};
use russh_sftp::protocol::OpenFlags;
use std::{
    fs,
    net::{IpAddr, Ipv4Addr},
    path::PathBuf,
    str::FromStr,
    sync::Arc,
    time::Duration,
};
use surge_ping::{Client, Config, PingIdentifier, PingSequence};
use tapo::ApiClient;
use tokio::{io::AsyncWriteExt, task::JoinSet};

use crate::{database::DatabaseHandle, sftp::SftpClient};

#[async_trait]
pub(crate) trait Monitor {
    fn timeout_interval(&self) -> Duration;
    async fn get_status(&mut self) -> Result<(), MonitorError>;
}

pub(crate) enum MonitorError {
    Down(anyhow::Error),
    Indeterminate(anyhow::Error),
}

pub(crate) struct TapoPowerMonitor {
    ip_addr: String,
    username: String,
    password: String,
    gateway: IpAddr,
    timeout: Duration,
}

impl TapoPowerMonitor {
    const GATEWAY_TIMEOUT: Duration = Duration::from_secs(1);
    const GATEWAY_RETRIES: u16 = 1;

    pub(crate) fn new(
        ip_addr: IpAddr,
        username: impl Into<String>,
        password: impl Into<String>,
        gateway: IpAddr,
        timeout: Duration,
    ) -> Self {
        TapoPowerMonitor {
            ip_addr: ip_addr.to_string(),
            username: username.into(),
            password: password.into(),
            gateway,
            timeout,
        }
    }

    async fn ping_gateway(&self) -> Result<()> {
        let client = Client::new(&Config::default())?;
        let mut pinger = client.pinger(self.gateway, PingIdentifier(random())).await;
        pinger.timeout(Self::GATEWAY_TIMEOUT);

        let mut last_error = None;
        for sequence in 0..=Self::GATEWAY_RETRIES {
            match pinger.ping(PingSequence(sequence), &[0; 56]).await {
                Ok(_) => return Ok(()),
                Err(error) => last_error = Some(error),
            }
        }
        Err(last_error.unwrap().into())
    }
}

#[async_trait]
impl Monitor for TapoPowerMonitor {
    fn timeout_interval(&self) -> Duration {
        // the ApiClient has timeout built-in, so the hard timeout should typically never be required to be called
        self.timeout
            .max(Self::GATEWAY_TIMEOUT * u32::from(Self::GATEWAY_RETRIES + 1))
            + Duration::from_secs(1)
    }

    async fn get_status(&mut self) -> Result<(), MonitorError> {
        let client = ApiClient::new(&self.username, &self.password).with_timeout(self.timeout);

        let (gateway_result, plug_result) =
            tokio::join!(self.ping_gateway(), client.p110(&self.ip_addr));

        if let Err(err) = gateway_result {
            return Err(MonitorError::Indeterminate(err));
        }

        match plug_result {
            Ok(_) => Ok(()),
            Err(err) => Err(MonitorError::Down(err.into())),
        }
    }
}

#[derive(Default, Debug)]
pub(crate) struct InternetMonitor;

impl InternetMonitor {
    const HOSTS: [IpAddr; 2] = [
        IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1)),
        IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8)),
    ];
    const PING_TIMEOUT: Duration = Duration::from_secs(1);

    async fn ping_hosts(&self) -> Result<()> {
        let client = Client::new(&Config::default())?;
        let mut ping_set = JoinSet::new();
        for host in Self::HOSTS.iter() {
            let mut pinger = client.pinger(*host, PingIdentifier(random())).await;
            pinger.timeout(Self::PING_TIMEOUT);

            ping_set.spawn(async move { pinger.ping(PingSequence(0), &[0; 56]).await });
        }

        let mut last_error = None;
        while let Some(result) = ping_set.join_next().await {
            match result {
                Ok(Ok(_)) => return Ok(()),
                Ok(Err(err)) => last_error = Some(anyhow::Error::from(err)),
                Err(err) => last_error = Some(anyhow::Error::from(err)),
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("no ping tasks were spawned")))
    }
}

#[async_trait]
impl Monitor for InternetMonitor {
    fn timeout_interval(&self) -> Duration {
        Duration::from_secs(5)
    }

    async fn get_status(&mut self) -> Result<(), MonitorError> {
        match self.ping_hosts().await {
            Ok(_) => Ok(()),
            Err(err) => Err(MonitorError::Down(err)),
        }
    }
}

pub(crate) struct BackupMonitor {
    database: DatabaseHandle,
    backup_database_path: PathBuf,

    // sftp
    server: String,
    server_fingerprint: Fingerprint,
    server_fingerprint_algo: Algorithm,
    username: String,
    private_key: Arc<PrivateKey>,
}

impl BackupMonitor {
    pub(crate) fn new(
        database: DatabaseHandle,
        backup_database_path: &str,
        server: impl Into<String>,
        server_fingerprint: &str,
        server_fingerprint_algo: Algorithm,
        username: impl Into<String>,
        private_key_pem: &str,
    ) -> Result<Self> {
        let private_key = decode_secret_key(private_key_pem, None)?.into();
        let server_fingerprint = Fingerprint::from_str(server_fingerprint)?;

        Ok(BackupMonitor {
            database,
            backup_database_path: PathBuf::from(backup_database_path),
            server: server.into(),
            server_fingerprint,
            server_fingerprint_algo,
            username: username.into(),
            private_key,
        })
    }

    async fn backup_db(&mut self) -> Result<()> {
        self.database.backup(&self.backup_database_path).await?;
        let bytes = fs::read(&self.backup_database_path)?;
        fs::remove_file(&self.backup_database_path)?;

        let sftp = SftpClient::create_session(
            &self.server,
            self.server_fingerprint,
            &self.server_fingerprint_algo,
            &self.username,
            self.private_key.clone(),
        )
        .await?;

        let mut file = sftp
            .open_with_flags(
                "status.db.tmp",
                OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
            )
            .await?;
        file.write_all(&bytes).await?;
        file.close().await?;

        if sftp.try_exists("status.db").await? {
            sftp.remove_file("status.db").await?;
        }
        sftp.rename("status.db.tmp", "status.db").await?;

        Ok(())
    }
}

#[async_trait]
impl Monitor for BackupMonitor {
    fn timeout_interval(&self) -> Duration {
        Duration::from_mins(10)
    }

    async fn get_status(&mut self) -> Result<(), MonitorError> {
        match self.backup_db().await {
            Ok(_) => Ok(()),
            Err(err) => Err(MonitorError::Down(err)),
        }
    }
}
