from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.security import require_access_code, require_session_id
from app.services.store import (
    APPLICATION_STATUSES,
    add_application,
    list_applications,
    update_application,
)

router = APIRouter(
    prefix="/api/applications",
    tags=["applications"],
    dependencies=[Depends(require_access_code)],
)

Status = Literal["submitted", "viewed", "interview", "offer", "rejected"]


class ApplicationIn(BaseModel):
    job_id: int
    job_kind: str = "2"
    title: str = ""
    company: str = ""
    city: str = ""
    salary: str = ""
    status: Status = "submitted"
    note: str = ""
    source: str = "liepin"
    contact_email: str = ""
    jd_url: str = ""
    status_source: str = "manual"


class ApplicationUpdate(BaseModel):
    status: Status | None = None
    note: str | None = Field(default=None, max_length=500)
    status_source: str | None = Field(default=None, max_length=32)


def _counts(items: list[dict]) -> dict[str, int]:
    counts = {status: 0 for status in APPLICATION_STATUSES}
    for item in items:
        key = str(item.get("status") or "submitted")
        if key in counts:
            counts[key] += 1
    counts["total"] = len(items)
    return counts


@router.get("")
async def read_applications(session_id: str = Depends(require_session_id)) -> dict:
    items = list_applications(session_id)
    return {"ok": True, "data": items, "counts": _counts(items)}


@router.post("")
async def create_application(
    body: ApplicationIn,
    session_id: str = Depends(require_session_id),
) -> dict:
    if body.job_kind not in ("1", "2", "email"):
        raise HTTPException(status_code=422, detail="job_kind 只能是 1、2 或 email。")
    item = add_application(session_id, body.model_dump())
    items = list_applications(session_id)
    return {"ok": True, "data": item, "counts": _counts(items)}


@router.patch("/{application_id}")
async def patch_application(
    application_id: int,
    body: ApplicationUpdate,
    session_id: str = Depends(require_session_id),
) -> dict:
    item = update_application(session_id, application_id, body.status, body.note, body.status_source)
    if item is None:
        raise HTTPException(status_code=404, detail="投递记录不存在。")
    items = list_applications(session_id)
    return {"ok": True, "data": item, "counts": _counts(items)}
