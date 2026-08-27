use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Result, bail};
use rusqlite::{Connection, MAIN_DB, Transaction, ffi, params, types::Null};
use serde::Serialize;
use tokio::sync::{mpsc, oneshot};

struct Database {
    connection: Connection,
}

#[derive(Serialize)]
pub(crate) struct OverallStatus {
    monitors: Vec<MonitorRow>,
    outages: Vec<OutageRow>,
}

#[derive(Serialize)]
pub(crate) struct MonitorRow {
    monitor_id: String,
    up: bool,
    next_update_in: i64,
    last_update: i64,
}

#[derive(Serialize)]
pub(crate) struct OutageRow {
    monitor_id: String,
    start: i64,
    end: Option<i64>,
    untracked: bool,
    excluded: Option<bool>,
    notes: Option<String>,
}

pub(crate) enum PatchOutcome {
    Updated,
    OutageNotFound,
}

impl Database {
    fn new(db_path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(db_path)?;

        connection.pragma_update(None, "journal_mode", &"WAL")?;
        connection.pragma_update(None, "foreign_keys", &1)?;
        connection.pragma_update(None, "busy_timeout", &3000)?;

        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS monitor (
                id              TEXT    PRIMARY KEY,
                up              INTEGER NOT NULL,
                next_update_in  INTEGER NOT NULL,
                last_update     INTEGER NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS outages (
                monitor_id  TEXT    NOT NULL,
                start       INTEGER NOT NULL,
                end         INTEGER NULL,
                untracked   INTEGER NOT NULL,
                PRIMARY KEY (monitor_id, start),
                FOREIGN KEY (monitor_id) REFERENCES monitor(id)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS max_one_ongoing_outage ON outages(monitor_id)
                WHERE end IS NULL;

            CREATE TABLE IF NOT EXISTS outage_info (
                monitor_id  TEXT    NOT NULL,
                start       INTEGER NOT NULL,
                excluded    INTEGER NULL,
                notes       TEXT    NULL,
                PRIMARY KEY (monitor_id, start),
                FOREIGN KEY (monitor_id, start) REFERENCES outages(monitor_id, start)
                    ON DELETE CASCADE
                    ON UPDATE CASCADE
            );
            ",
        )?;

        connection.set_prepared_statement_cache_capacity(16);

        let database = Database { connection };
        Ok(database)
    }

    fn end_ongoing_outage(tx: &Transaction, monitor_id: &str, end: i64) -> anyhow::Result<()> {
        let outage_start = tx
            .prepare_cached("SELECT start FROM outages WHERE monitor_id = ?1 AND end IS NULL")?
            .query_one(&[monitor_id], |row| row.get::<_, i64>("start"))?;

        // delete the ongoing outage if there is no recorded duration
        if outage_start == end {
            tx.prepare_cached("DELETE FROM outages WHERE monitor_id = ?1 AND end IS NULL")?
                .execute(&[monitor_id])?;
        } else {
            tx.prepare_cached("UPDATE outages SET end = ?2 WHERE monitor_id = ?1 AND end IS NULL")?
                .execute(params![monitor_id, end])?;
        }
        Ok(())
    }

    fn get_monitor_rows(&self) -> anyhow::Result<Vec<MonitorRow>> {
        let rows = self
            .connection
            .prepare_cached(
                "
                SELECT id, up, next_update_in, last_update
                FROM monitor",
            )?
            .query_map([], |row| {
                Ok(MonitorRow {
                    monitor_id: row.get("id")?,
                    up: row.get("up")?,
                    next_update_in: row.get("next_update_in")?,
                    last_update: row.get("last_update")?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    fn get_outage_rows(&self) -> anyhow::Result<Vec<OutageRow>> {
        let rows = self
            .connection
            .prepare_cached(
                "
                SELECT monitor_id, start, end, untracked, excluded, notes
                FROM outages
                LEFT JOIN outage_info USING (monitor_id, start)",
            )?
            .query_map([], |row| {
                Ok(OutageRow {
                    monitor_id: row.get("monitor_id")?,
                    start: row.get("start")?,
                    end: row.get("end")?,
                    untracked: row.get("untracked")?,
                    excluded: row.get("excluded")?,
                    notes: row.get("notes")?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    fn get_overall_status(&self) -> anyhow::Result<OverallStatus> {
        Ok(OverallStatus {
            monitors: self.get_monitor_rows()?,
            outages: self.get_outage_rows()?,
        })
    }

    fn patch_outage_info(
        &self,
        monitor_id: &str,
        start: i64,
        excluded: Option<Option<bool>>,
        notes: Option<Option<String>>,
    ) -> anyhow::Result<PatchOutcome> {
        let (set_excluded, excluded) = (excluded.is_some(), excluded.flatten());
        let (set_notes, notes) = (notes.is_some(), notes.flatten());

        let result = self
            .connection
            .prepare_cached(
                "INSERT INTO outage_info (monitor_id, start, excluded, notes)
                 VALUES (?1, ?2, ?3, ?5)
                 ON CONFLICT (monitor_id, start) DO UPDATE SET
                     excluded = CASE WHEN ?4 THEN ?3 ELSE excluded END,
                     notes    = CASE WHEN ?6 THEN ?5 ELSE notes END",
            )?
            .execute(params![
                monitor_id,
                start,
                excluded,
                set_excluded,
                notes,
                set_notes
            ]);

        match result {
            Ok(_) => Ok(PatchOutcome::Updated),
            Err(rusqlite::Error::SqliteFailure(error, _))
                if error.extended_code == ffi::SQLITE_CONSTRAINT_FOREIGNKEY =>
            {
                Ok(PatchOutcome::OutageNotFound)
            }
            Err(error) => Err(error.into()),
        }
    }

    fn update_status(
        &mut self,
        monitor_id: &str,
        up: bool,
        next_update_in: i64,
        now: i64,
    ) -> anyhow::Result<()> {
        let tx = self.connection.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "SELECT up, next_update_in, last_update FROM monitor WHERE id = ?1",
            )?;
            match stmt.query_one([monitor_id], |row| {
                Ok((
                    row.get::<_, bool>("up")?,
                    row.get::<_, i64>("next_update_in")?,
                    row.get::<_, i64>("last_update")?,
                ))
            }) {
                Ok((mut old_up, old_next_update_in, old_last_update)) => {
                    // Ensure update is actually newer compared to the previous database entry
                    if now <= old_last_update {
                        bail!(
                            "Update has older timestamp compared to db entry. Diff: {}s",
                            now - old_last_update
                        );
                    }

                    // Update monitor status
                    tx.prepare_cached(
                        "UPDATE monitor SET up = ?2, next_update_in = ?3, last_update = ?4 WHERE id = ?1",
                    )?
                    .execute(params![monitor_id, up, next_update_in, now])?;

                    // Detect if the monitor was down
                    if old_last_update + next_update_in.max(old_next_update_in) * 2 < now {
                        // check if there was an ongoing outage
                        if !old_up {
                            Self::end_ongoing_outage(&tx, monitor_id, old_last_update)?;
                            old_up = true;
                        }

                        // add untracked outage
                        tx.prepare_cached("INSERT INTO outages (monitor_id, start, end, untracked) VALUES (?, ?, ?, ?)")?
                            .execute(params![monitor_id, old_last_update, now, 1])?;
                    }

                    if up != old_up {
                        match up {
                            // outage just started
                            false => {
                                tx.prepare_cached("INSERT INTO outages (monitor_id, start, end, untracked) VALUES (?, ?, ?, ?)")?
                                    .execute(params![monitor_id, now, Null, 0])?;
                            }
                            // outage just ended
                            true => Self::end_ongoing_outage(&tx, monitor_id, old_last_update)?,
                        };
                    }
                }
                Err(rusqlite::Error::QueryReturnedNoRows) => {
                    // Add monitor
                    tx.prepare_cached(
                        "INSERT INTO monitor (id, up, next_update_in, last_update) VALUES (?, ?, ?, ?)",
                    )?
                    .execute(params![monitor_id, up, next_update_in, now])?;

                    // Add untracked outage from the beginning of time
                    tx.prepare_cached("INSERT INTO outages (monitor_id, start, end, untracked) VALUES (?, ?, ?, ?)")?
                        .execute(params![monitor_id, 0, now, 1])?;

                    // add an ongoing outage if down
                    if !up {
                        tx.prepare_cached("INSERT INTO outages (monitor_id, start, end, untracked) VALUES (?, ?, ?, ?)")?
                            .execute(params![monitor_id, now, Null, 0])?;
                    }
                }
                Err(e) => bail!("sqlite error: {e}"),
            }
        }
        tx.commit()?;
        Ok(())
    }

    fn backup(&mut self, path: impl AsRef<Path>) -> anyhow::Result<()> {
        Ok(self.connection.backup(MAIN_DB, path, None)?)
    }
}

enum DatabaseMessage {
    GetOverallStatus(oneshot::Sender<anyhow::Result<OverallStatus>>),
    UpdateStatus(oneshot::Sender<anyhow::Result<()>>, String, bool, i64, i64),
    PatchOutageInfo(
        oneshot::Sender<anyhow::Result<PatchOutcome>>,
        String,
        i64,
        Option<Option<bool>>,
        Option<Option<String>>,
    ),
    Backup(oneshot::Sender<anyhow::Result<()>>, PathBuf),
}

#[derive(Debug, Clone)]
pub(crate) struct DatabaseHandle {
    sender: mpsc::UnboundedSender<DatabaseMessage>,
}

impl DatabaseHandle {
    pub fn new(db_path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let (sender, mut receiver) = mpsc::unbounded_channel();
        let mut database = Database::new(db_path)?;

        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                match message {
                    DatabaseMessage::GetOverallStatus(tx) => {
                        let _ = tx.send(database.get_overall_status());
                    }
                    DatabaseMessage::UpdateStatus(
                        tx,
                        monitor_id,
                        up,
                        next_update_in,
                        last_update,
                    ) => {
                        let _ = tx.send(database.update_status(
                            &monitor_id,
                            up,
                            next_update_in,
                            last_update,
                        ));
                    }
                    DatabaseMessage::PatchOutageInfo(tx, monitor_id, start, excluded, notes) => {
                        let _ = tx.send(database.patch_outage_info(
                            &monitor_id,
                            start,
                            excluded,
                            notes,
                        ));
                    }
                    DatabaseMessage::Backup(tx, dest_path) => {
                        let _ = tx.send(database.backup(dest_path));
                    }
                }
            }
        });

        Ok(DatabaseHandle { sender })
    }

    pub async fn update_status(
        &self,
        monitor_id: impl Into<String>,
        up: bool,
        next_update_in: i64,
    ) -> anyhow::Result<()> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
        let (tx, rx) = oneshot::channel();
        let message = DatabaseMessage::UpdateStatus(tx, monitor_id.into(), up, next_update_in, now);
        self.sender.send(message)?;
        rx.await?
    }

    pub async fn get_overall_status(&self) -> anyhow::Result<OverallStatus> {
        let (tx, rx) = oneshot::channel();
        self.sender.send(DatabaseMessage::GetOverallStatus(tx))?;
        rx.await?
    }

    pub async fn patch_outage_info(
        &self,
        monitor_id: impl Into<String>,
        start: i64,
        excluded: Option<Option<bool>>,
        notes: Option<Option<String>>,
    ) -> anyhow::Result<PatchOutcome> {
        let (tx, rx) = oneshot::channel();
        let message =
            DatabaseMessage::PatchOutageInfo(tx, monitor_id.into(), start, excluded, notes);
        self.sender.send(message)?;
        rx.await?
    }

    pub async fn backup(&self, dest_path: impl Into<PathBuf>) -> anyhow::Result<()> {
        let (tx, rx) = oneshot::channel();
        let message = DatabaseMessage::Backup(tx, dest_path.into());
        self.sender.send(message)?;
        rx.await?
    }
}
