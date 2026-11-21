from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS resume (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    template_id TEXT NOT NULL DEFAULT 'classic',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    messages TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    job_id INTEGER NOT NULL,
    job_kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted',
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'liepin',
    contact_email TEXT NOT NULL DEFAULT '',
    jd_url TEXT NOT NULL DEFAULT '',
    status_source TEXT NOT NULL DEFAULT 'manual',
    last_reply_at TEXT NOT NULL DEFAULT '',
    email_subject TEXT NOT NULL DEFAULT '',
    email_sent_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (session_id, job_id, job_kind)
);

CREATE INDEX IF NOT EXISTS idx_applications_session ON applications (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    application_id INTEGER,
    uid TEXT NOT NULL,
    from_addr TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    snippet TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'unknown',
    is_read INTEGER NOT NULL DEFAULT 0,
    received_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (session_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_replies_session ON email_replies (session_id, received_at DESC);

CREATE TABLE IF NOT EXISTS official_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    salary TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (session_id, url, title)
);

CREATE INDEX IF NOT EXISTS idx_official_session ON official_jobs (session_id, created_at DESC);
"""

APPLICATION_MIGRATIONS = {
    "source": "TEXT NOT NULL DEFAULT 'liepin'",
    "contact_email": "TEXT NOT NULL DEFAULT ''",
    "jd_url": "TEXT NOT NULL DEFAULT ''",
    "status_source": "TEXT NOT NULL DEFAULT 'manual'",
    "last_reply_at": "TEXT NOT NULL DEFAULT ''",
    "email_subject": "TEXT NOT NULL DEFAULT ''",
    "email_sent_at": "TEXT NOT NULL DEFAULT ''",
}
REPLY_MIGRATIONS = {
    "is_read": "INTEGER NOT NULL DEFAULT 0",
}
RESUME_MIGRATIONS = {
    "template_id": "TEXT NOT NULL DEFAULT 'classic'",
}


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = Path(get_settings().database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        _ensure_columns(conn, "applications", APPLICATION_MIGRATIONS)
        _ensure_columns(conn, "resume", RESUME_MIGRATIONS)
        _ensure_columns(conn, "email_replies", REPLY_MIGRATIONS)
