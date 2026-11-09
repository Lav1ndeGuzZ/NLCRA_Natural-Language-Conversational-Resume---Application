from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.db import connect


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_resume(session_id: str) -> tuple[dict[str, Any] | None, str | None]:
    with connect() as conn:
        row = conn.execute(
            "SELECT data, updated_at FROM resume WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        return None, None
    try:
        return json.loads(row["data"]), row["updated_at"]
    except ValueError:
        return None, row["updated_at"]


def save_resume(session_id: str, resume: dict[str, Any]) -> str:
    updated_at = _now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO resume (session_id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT (session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
            """,
            (session_id, json.dumps(resume, ensure_ascii=False), updated_at),
        )
    return updated_at


def load_chat(session_id: str) -> tuple[list[dict[str, Any]] | None, str | None]:
    with connect() as conn:
        row = conn.execute(
            "SELECT messages, updated_at FROM chat_session WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        return None, None
    try:
        messages = json.loads(row["messages"])
    except ValueError:
        return None, row["updated_at"]
    return messages if isinstance(messages, list) else None, row["updated_at"]


def save_chat(session_id: str, messages: list[dict[str, Any]]) -> str:
    updated_at = _now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO chat_session (session_id, messages, updated_at) VALUES (?, ?, ?)
            ON CONFLICT (session_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
            """,
            (session_id, json.dumps(messages, ensure_ascii=False), updated_at),
        )
    return updated_at


APPLICATION_STATUSES = ("submitted", "viewed", "interview", "offer", "rejected")


def add_application(session_id: str, job: dict[str, Any]) -> dict[str, Any]:
    created_at = _now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO applications
                (session_id, job_id, job_kind, title, company, city, salary, status, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (session_id, job_id, job_kind) DO NOTHING
            """,
            (
                session_id,
                int(job["job_id"]),
                str(job["job_kind"]),
                str(job.get("title") or ""),
                str(job.get("company") or ""),
                str(job.get("city") or ""),
                str(job.get("salary") or ""),
                str(job.get("status") or "submitted"),
                str(job.get("note") or ""),
                created_at,
            ),
        )
        row = conn.execute(
            """
            SELECT id, job_id, job_kind, title, company, city, salary, status, note, created_at
            FROM applications
            WHERE session_id = ? AND job_id = ? AND job_kind = ?
            """,
            (session_id, int(job["job_id"]), str(job["job_kind"])),
        ).fetchone()
    return dict(row) if row else {}


def list_applications(session_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, job_id, job_kind, title, company, city, salary, status, note, created_at
            FROM applications
            WHERE session_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (session_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def update_application(
    session_id: str,
    application_id: int,
    status: str | None = None,
    note: str | None = None,
) -> dict[str, Any] | None:
    fields: list[str] = []
    values: list[Any] = []
    if status is not None:
        fields.append("status = ?")
        values.append(status)
    if note is not None:
        fields.append("note = ?")
        values.append(note)
    if not fields:
        return None
    values.extend([session_id, application_id])
    with connect() as conn:
        conn.execute(
            f"UPDATE applications SET {', '.join(fields)} WHERE session_id = ? AND id = ?",
            tuple(values),
        )
        row = conn.execute(
            """
            SELECT id, job_id, job_kind, title, company, city, salary, status, note, created_at
            FROM applications
            WHERE session_id = ? AND id = ?
            """,
            (session_id, application_id),
        ).fetchone()
    return dict(row) if row else None
