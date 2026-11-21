from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.security import require_access_code, require_session_id
from app.services.store import list_applications, list_email_replies

router = APIRouter(
    prefix="/api/reminders",
    tags=["reminders"],
    dependencies=[Depends(require_access_code)],
)

REMINDER_DAYS = (3, 7, 14)


def _age_days(value: str) -> int:
    try:
        created = datetime.fromisoformat(value)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - created).days)
    except (ValueError, TypeError):
        return 0


@router.get("")
async def list_reminders(session_id: str = Depends(require_session_id)) -> dict:
    items: list[dict] = []
    for application in list_applications(session_id):
        status = str(application.get("status") or "submitted")
        if status not in {"submitted", "viewed"}:
            continue
        days = _age_days(str(application.get("created_at") or ""))
        due = [day for day in REMINDER_DAYS if days >= day]
        if not due:
            continue
        level = max(due)
        items.append(
            {
                "kind": "followup",
                "application_id": application["id"],
                "title": application.get("title") or "未命名职位",
                "company": application.get("company") or "",
                "status": status,
                "days_since": days,
                "level": level,
                "message": f"投递已 {days} 天，建议回猎聘/邮箱查看进展并更新状态。",
            }
        )

    for reply in list_email_replies(session_id):
        if reply.get("is_read"):
            continue
        category = str(reply.get("category") or "unknown")
        level = {"interview": 7, "offer": 7, "viewed": 3}.get(category, 1)
        items.append(
            {
                "kind": "reply",
                "email_reply_id": reply["id"],
                "application_id": reply.get("application_id"),
                "title": reply.get("subject") or "新回信",
                "company": reply.get("from_addr") or "",
                "status": category,
                "days_since": 0,
                "level": level,
                "message": f"收到新回信：{reply.get('snippet') or '请到投递中心查看'}",
            }
        )

    items.sort(key=lambda item: (-item["level"], -item["days_since"]))
    return {"ok": True, "data": items, "total": len(items)}
