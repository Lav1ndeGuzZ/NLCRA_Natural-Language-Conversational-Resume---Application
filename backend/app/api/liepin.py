from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import ApplyRequest, JobSearchRequest
from app.security import require_access_code, require_liepin_token
from app.services.liepin import LiepinClient, LiepinError

router = APIRouter(
    prefix="/api/liepin",
    tags=["liepin"],
    dependencies=[Depends(require_access_code)],
)


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
        data = await LiepinClient(token).search_jobs(payload)
        return {"ok": True, "data": data}
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
