use std::{borrow::Cow, sync::Arc};

use anyhow::bail;
use russh::{
    client,
    keys::{
        Algorithm, PrivateKey, PrivateKeyWithHashAlg, PublicKeyOrCertificate, ssh_key::Fingerprint,
    },
};
use russh_sftp::client::SftpSession;

pub(crate) struct SftpClient {
    server_fingerprint: Fingerprint,
}

impl client::Handler for SftpClient {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let result = match server_public_key {
            PublicKeyOrCertificate::Certificate(_) => false,
            PublicKeyOrCertificate::PublicKey { key, .. } => {
                self.server_fingerprint == key.fingerprint(self.server_fingerprint.algorithm())
            }
        };
        Ok(result)
    }
}

impl SftpClient {
    pub(crate) async fn create_session(
        server: &str,
        server_fingerprint: Fingerprint,
        server_fingerprint_algo: &Algorithm,
        username: &str,
        private_key: Arc<PrivateKey>,
    ) -> anyhow::Result<SftpSession> {
        let mut config = client::Config::default();
        config.preferred.key = Cow::Owned(vec![server_fingerprint_algo.to_owned()]);
        let sh = SftpClient { server_fingerprint };

        let mut session = client::connect(config.into(), (server, 22), sh).await?;
        let result = session
            .authenticate_publickey(username, PrivateKeyWithHashAlg::new(private_key, None))
            .await?;

        if !result.success() {
            bail!("Authentication failure: {result:?}");
        }

        let channel = session.channel_open_session().await?;
        channel.request_subsystem(true, "sftp").await?;

        Ok(SftpSession::new(channel.into_stream()).await?)
    }
}
