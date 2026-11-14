from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import ApplyRequest, JobSearchRequest
from app.security import require_access_code, require_liepin_token
from app.services.liepin import LiepinClient, LiepinError

router = APIRouter(
    prefix="/api/liepin",
    tags=["liepin"],
    dependencies=[Depends(require_access_code)],
)


def _extract_items(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []
    for key in ("jobs", "list", "data", "result", "items"):
        value = data.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            nested = _extract_items(value)
            if nested:
                return nested
    return []


def _job_identity(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("jobId", "job_id", "id"):
            value = item.get(key)
            if value not in (None, ""):
                return f"{key}:{value}"
    return repr(item)[:200]


@router.get("/resume")
async def get_resume(token: str = Depends(require_liepin_token)) -> dict:
    try:
        data = await LiepinClient(token).get_resume()
        return {"ok": True, "data": data}
    except LiepinError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/jobs/search")
async def search_jobs(
    body: JobSearchRequest,
    token: str = Depends(require_liepin_token),
) -> dict:
    payload = {
        "jobName": body.job_name,
        "address": body.address,
        "salaryFloor": body.salary_floor,
        "salaryCap": body.salary_cap,
        "salaryKind": body.salary_kind,
        "workExperience": body.work_experience,
        "eduLevel": body.edu_level,
        "compNature": body.comp_nature,
        "companyName": body.company_name,
        "page": body.page,
    }
    payload = {key: value for key, value in payload.items() if value not in (None, "")}
    try:
        client = LiepinClient(token)
        merged: list[Any] = []
        seen: set[str] = set()
        fetched_pages = 0
        for offset in range(body.pages):
            payload["page"] = body.page + offset
            data = await client.search_jobs(payload)
            fetched_pages += 1
            items = _extract_items(data)
            if not items:
                break
            added = 0
            for item in items:
                identity = _job_identity(item)
                if identity in seen:
                    continue
                seen.add(identity)
                merged.append(item)
                added += 1
            if added == 0:
                break
        return {
            "ok": True,
            "data": merged,
            "pages": fetched_pages,
            "total": len(merged),
        }
    except LiepinError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/apply")
async def apply_job(
    body: ApplyRequest,
    token: str = Depends(require_liepin_token),
) -> dict:
    try:
        data = await LiepinClient(token).apply_job(
            {"jobId": body.job_id, "jobKind": body.job_kind}
        )
        return {"ok": True, "data": data}
    except LiepinError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
