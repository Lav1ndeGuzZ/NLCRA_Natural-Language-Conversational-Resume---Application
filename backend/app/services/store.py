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


def load_resume_meta(session_id: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute(
            "SELECT template_id, updated_at FROM resume WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        return {"template_id": "classic", "updated_at": None}
    return {"template_id": row["template_id"] or "classic", "updated_at": row["updated_at"]}


def save_resume(
    session_id: str,
    resume: dict[str, Any],
    template_id: str = "classic",
) -> str:
    updated_at = _now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO resume (session_id, data, template_id, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (session_id) DO UPDATE SET
                data = excluded.data,
                template_id = excluded.template_id,
                updated_at = excluded.updated_at
            """,
            (session_id, json.dumps(resume, ensure_ascii=False), template_id or "classic", updated_at),
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

APPLICATION_COLUMNS = (
    "id, job_id, job_kind, title, company, city, salary, status, note, "
    "source, contact_email, jd_url, status_source, last_reply_at, "
    "email_subject, email_sent_at, created_at"
)


def add_application(session_id: str, job: dict[str, Any]) -> dict[str, Any]:
    created_at = _now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO applications
                (session_id, job_id, job_kind, title, company, city, salary, status, note,
                 source, contact_email, jd_url, status_source, last_reply_at,
                 email_subject, email_sent_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (session_id, job_id, job_kind) DO UPDATE SET
                title = excluded.title,
                company = excluded.company,
                city = excluded.city,
                salary = excluded.salary,
                source = CASE WHEN excluded.source != '' THEN excluded.source ELSE applications.source END,
                contact_email = CASE WHEN excluded.contact_email != '' THEN excluded.contact_email ELSE applications.contact_email END,
                jd_url = CASE WHEN excluded.jd_url != '' THEN excluded.jd_url ELSE applications.jd_url END,
                email_subject = CASE WHEN excluded.email_subject != '' THEN excluded.email_subject ELSE applications.email_subject END,
                email_sent_at = CASE WHEN excluded.email_sent_at != '' THEN excluded.email_sent_at ELSE applications.email_sent_at END
            """,
            (
                session_id,
                int(job.get("job_id") or 0),
                str(job.get("job_kind") or "email"),
                str(job.get("title") or ""),
                str(job.get("company") or ""),
                str(job.get("city") or ""),
                str(job.get("salary") or ""),
                str(job.get("status") or "submitted"),
                str(job.get("note") or ""),
                str(job.get("source") or "liepin"),
                str(job.get("contact_email") or ""),
                str(job.get("jd_url") or ""),
                str(job.get("status_source") or "manual"),
                str(job.get("last_reply_at") or ""),
                str(job.get("email_subject") or ""),
                str(job.get("email_sent_at") or ""),
                created_at,
            ),
        )
        row = conn.execute(
            f"""
            SELECT {APPLICATION_COLUMNS}
            FROM applications
            WHERE session_id = ? AND job_id = ? AND job_kind = ?
            """,
            (session_id, int(job.get("job_id") or 0), str(job.get("job_kind") or "email")),
        ).fetchone()
    return dict(row) if row else {}


def list_applications(session_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT {APPLICATION_COLUMNS}
            FROM applications
            WHERE session_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (session_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_application(session_id: str, application_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            f"SELECT {APPLICATION_COLUMNS} FROM applications WHERE session_id = ? AND id = ?",
            (session_id, application_id),
        ).fetchone()
    return dict(row) if row else None


def update_application(
    session_id: str,
    application_id: int,
    status: str | None = None,
    note: str | None = None,
    status_source: str | None = None,
    last_reply_at: str | None = None,
) -> dict[str, Any] | None:
    fields: list[str] = []
    values: list[Any] = []
    if status is not None:
        fields.append("status = ?")
        values.append(status)
    if note is not None:
        fields.append("note = ?")
        values.append(note)
    if status_source is not None:
        fields.append("status_source = ?")
        values.append(status_source)
    if last_reply_at is not None:
        fields.append("last_reply_at = ?")
        values.append(last_reply_at)
    if not fields:
        return None
    values.extend([session_id, application_id])
    with connect() as conn:
        conn.execute(
            f"UPDATE applications SET {', '.join(fields)} WHERE session_id = ? AND id = ?",
            tuple(values),
        )
        row = conn.execute(
            f"SELECT {APPLICATION_COLUMNS} FROM applications WHERE session_id = ? AND id = ?",
            (session_id, application_id),
        ).fetchone()
    return dict(row) if row else None


def add_email_reply(session_id: str, reply: dict[str, Any]) -> bool:
    with connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO email_replies
                (session_id, application_id, uid, from_addr, subject, snippet, body,
                 category, received_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (session_id, uid) DO NOTHING
            """,
            (
                session_id,
                reply.get("application_id"),
                str(reply.get("uid") or ""),
                str(reply.get("from_addr") or ""),
                str(reply.get("subject") or ""),
                str(reply.get("snippet") or ""),
                str(reply.get("body") or ""),
                str(reply.get("category") or "unknown"),
                str(reply.get("received_at") or ""),
                _now(),
            ),
        )
        return cursor.rowcount > 0


def mark_email_replies_read(session_id: str, reply_ids: list[int] | None = None) -> int:
    with connect() as conn:
        if reply_ids:
            placeholders = ",".join("?" for _ in reply_ids)
            cursor = conn.execute(
                f"UPDATE email_replies SET is_read = 1 WHERE session_id = ? AND id IN ({placeholders})",
                (session_id, *reply_ids),
            )
        else:
            cursor = conn.execute(
                "UPDATE email_replies SET is_read = 1 WHERE session_id = ?",
                (session_id,),
            )
        return cursor.rowcount


def list_email_replies(session_id: str, limit: int = 50) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, application_id, uid, from_addr, subject, snippet, category,
                   is_read, received_at, created_at
            FROM email_replies
            WHERE session_id = ?
            ORDER BY received_at DESC, id DESC
            LIMIT ?
            """,
            (session_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def list_reply_bodies(session_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, application_id, from_addr, subject, snippet, body, category, is_read, received_at
            FROM email_replies WHERE session_id = ? ORDER BY received_at DESC
            """,
            (session_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def save_official_jobs(session_id: str, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    created_at = _now()
    saved: list[dict[str, Any]] = []
    with connect() as conn:
        for job in jobs:
            conn.execute(
                """
                INSERT INTO official_jobs
                    (session_id, company, title, city, salary, url, contact_email, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (session_id, url, title) DO UPDATE SET
                    company = excluded.company,
                    city = excluded.city,
                    salary = excluded.salary,
                    contact_email = CASE WHEN excluded.contact_email != '' THEN excluded.contact_email ELSE official_jobs.contact_email END,
                    description = excluded.description
                """,
                (
                    session_id,
                    str(job.get("company") or ""),
                    str(job.get("title") or ""),
                    str(job.get("city") or ""),
                    str(job.get("salary") or ""),
                    str(job.get("url") or ""),
                    str(job.get("email") or job.get("contact_email") or ""),
                    str(job.get("description") or ""),
                    created_at,
                ),
            )
            row = conn.execute(
                """
                SELECT id, company, title, city, salary, url, contact_email, description, created_at
                FROM official_jobs
                WHERE session_id = ? AND url = ? AND title = ?
                """,
                (session_id, str(job.get("url") or ""), str(job.get("title") or "")),
            ).fetchone()
            if row:
                item = dict(row)
                item["email"] = item.pop("contact_email")
                saved.append(item)
    return saved


def list_official_jobs(session_id: str, limit: int = 100) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, company, title, city, salary, url, contact_email, description, created_at
            FROM official_jobs WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
            """,
            (session_id, limit),
        ).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item["email"] = item.pop("contact_email")
        items.append(item)
    return items
