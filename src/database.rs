use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Result, bail};
use rusqlite::{Connection, Transaction, params, types::Null};
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

impl Database {
    fn new() -> Result<Self> {
        let connection = Connection::open("./monitor.db")?;

        connection.pragma_update(None, "journal_mode", &"WAL")?;
        connection.pragma_update(None, "foreign_keys", &1)?;
        connection.pragma_update(None, "busy_timeout", &3000)?;

        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS monitor (
                id          TEXT    PRIMARY KEY,
                up          INTEGER NOT NULL,
                seq_num     INTEGER NOT NULL,
                last_update INTEGER NOT NULL
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
                SELECT id, up, last_update
                FROM monitor",
            )?
            .query_map([], |row| {
                Ok(MonitorRow {
                    monitor_id: row.get("id")?,
                    up: row.get("up")?,
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

    fn update_status(
        &mut self,
        monitor_id: &str,
        up: bool,
        seq_num: i64,
        now: i64,
    ) -> anyhow::Result<()> {
        let tx = self.connection.transaction()?;
        {
            let mut stmt =
                tx.prepare_cached("SELECT up, seq_num, last_update FROM monitor WHERE id = ?1")?;
            match stmt.query_one([monitor_id], |row| {
                Ok((
                    row.get::<_, bool>("up")?,
                    row.get::<_, i64>("seq_num")?,
                    row.get::<_, i64>("last_update")?,
                ))
            }) {
                Ok((mut old_up, old_seq_num, old_last_update)) => {
                    // Ensure update is actually newer compared to the previous database entry
                    if now <= old_last_update {
                        bail!(
                            "Update has older timestamp compared to db entry. Diff: {}s",
                            now - old_last_update
                        );
                    }

                    // Update monitor status
                    tx.prepare_cached(
                        "UPDATE monitor SET up = ?2, seq_num = ?3, last_update = ?4 WHERE id = ?1",
                    )?
                    .execute(params![monitor_id, up, seq_num, now])?;

                    // Detect if the monitor was down
                    if old_seq_num + 1 != seq_num || old_last_update + 60 < now {
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
                        "INSERT INTO monitor (id, up, seq_num, last_update) VALUES (?, ?, ?, ?)",
                    )?
                    .execute(params![monitor_id, up, seq_num, now])?;

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
}

enum DatabaseMessage {
    GetOverallStatus(oneshot::Sender<anyhow::Result<OverallStatus>>),
    UpdateStatus(oneshot::Sender<anyhow::Result<()>>, String, bool, i64, i64),
}

#[derive(Debug, Clone)]
pub(crate) struct DatabaseHandle {
    sender: mpsc::UnboundedSender<DatabaseMessage>,
}

impl DatabaseHandle {
    pub fn new() -> anyhow::Result<Self> {
        let (sender, mut receiver) = mpsc::unbounded_channel();
        let mut database = Database::new()?;

        tokio::spawn(async move {
            while let Some(message) = receiver.recv().await {
                match message {
                    DatabaseMessage::GetOverallStatus(tx) => {
                        let _ = tx.send(database.get_overall_status());
                    }
                    DatabaseMessage::UpdateStatus(tx, monitor_id, up, seq_num, last_update) => {
                        let _ =
                            tx.send(database.update_status(&monitor_id, up, seq_num, last_update));
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
        seq_num: i64,
    ) -> anyhow::Result<()> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
        let (tx, rx) = oneshot::channel();
        let message = DatabaseMessage::UpdateStatus(tx, monitor_id.into(), up, seq_num, now);
        self.sender.send(message)?;
        rx.await?
    }

    pub async fn get_overall_status(&self) -> anyhow::Result<OverallStatus> {
        let (tx, rx) = oneshot::channel();
        self.sender.send(DatabaseMessage::GetOverallStatus(tx))?;
        rx.await?
    }
}
