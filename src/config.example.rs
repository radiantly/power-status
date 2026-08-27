pub(crate) const DB_PATH: &str = "./status.db";
pub(crate) const DB_BACKUP_PATH: &str = "./status.backup.db";

pub(crate) const ADMIN_PASSWORD: &str = "correct-horse-battery-staple";

pub(crate) const TAPO_USERNAME: &str = "hi@itsme.com";
pub(crate) const TAPO_PASSWORD: &str = "imtheproblemitsme";
pub(crate) const TAPO_PLUG_IP: &str = "192.168.1.63";

pub(crate) const SFTP_SERVER: &str = "backup.example.com";
pub(crate) const SFTP_SERVER_FINGERPRINT: &str =
    "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
pub(crate) const SFTP_SERVER_FINGERPRINT_ALGO: russh::keys::Algorithm =
    russh::keys::Algorithm::Ed25519;
pub(crate) const SFTP_USERNAME: &str = "status";
pub(crate) const SFTP_PRIVATE_KEY: &str = "-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAA...
-----END OPENSSH PRIVATE KEY-----
";
