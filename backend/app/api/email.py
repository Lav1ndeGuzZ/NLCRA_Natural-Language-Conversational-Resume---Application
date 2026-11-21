from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.schemas import EmailDraftRequest, EmailSendRequest
from app.security import require_access_code, require_qq_credentials, require_session_id
from app.services.emailer import (
    EmailError,
    EmailNotConfigured,
    compose_application_email,
    record_email_application,
    send_qq_email,
    sync_qq_replies,
)
from app.services.store import list_applications, list_email_replies, mark_email_replies_read

class MarkReadRequest(BaseModel):
    ids: list[int] | None = None


router = APIRouter(
    prefix="/api/email",
    tags=["email"],
    dependencies=[Depends(require_access_code)],
)


@router.post("/draft")
async def draft_email(body: EmailDraftRequest) -> dict:
    return {
        "ok": True,
        "data": compose_application_email(body.resume, body.job, body.match),
    }


@router.post("/send")
async def send_email(
    body: EmailSendRequest,
    session_id: str = Depends(require_session_id),
    credentials: tuple[str, str] = Depends(require_qq_credentials),
) -> dict:
    account, auth_code = credentials
    try:
        result = send_qq_email(
            account,
            auth_code,
            body.to,
            body.subject,
            body.body,
            body.resume,
            template_id=body.template_id,
        )
    except EmailNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EmailError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    job = dict(body.job)
    job["email"] = body.to
    application = record_email_application(session_id, job, body.to, body.subject)
    return {"ok": True, "data": result, "application": application}


@router.post("/sync")
async def sync_replies(
    session_id: str = Depends(require_session_id),
    credentials: tuple[str, str] = Depends(require_qq_credentials),
) -> dict:
    account, auth_code = credentials
    try:
        result = sync_qq_replies(session_id, account, auth_code)
    except EmailNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EmailError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "ok": True,
        "data": result,
        "applications": list_applications(session_id),
    }


@router.get("/replies")
async def replies(
    session_id: str = Depends(require_session_id),
) -> dict:
    items = list_email_replies(session_id)
    return {"ok": True, "data": items, "unread": sum(1 for item in items if not item.get("is_read"))}


@router.post("/replies/read")
async def mark_replies_read(
    body: MarkReadRequest,
    session_id: str = Depends(require_session_id),
) -> dict:
    updated = mark_email_replies_read(session_id, body.ids)
    return {"ok": True, "updated": updated}
