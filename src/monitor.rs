use anyhow::{Result, bail};
use async_trait::async_trait;
use rand::random;
use russh::keys::{Algorithm, PrivateKey, decode_secret_key, ssh_key::Fingerprint};
use russh_sftp::protocol::OpenFlags;
use std::{fs, path::PathBuf, str::FromStr, sync::Arc, time::Duration};
use surge_ping::{Client, Config, PingIdentifier, PingSequence};
use tapo::ApiClient;
use tokio::io::AsyncWriteExt;

use crate::{database::DatabaseHandle, sftp::SftpClient};

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

#[derive(Default, Debug)]
pub(crate) struct InternetMonitor;

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
}

#[async_trait]
impl Monitor for BackupMonitor {
    fn timeout_interval(&self) -> Duration {
        Duration::from_mins(10)
    }

    async fn get_status(&mut self) -> Result<()> {
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
