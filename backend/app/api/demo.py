from fastapi import APIRouter, Depends

from app.config import get_settings
from app.demo_data import DEMO_JOBS, DEMO_RESUME
from app.security import require_access_code

router = APIRouter(
    prefix="/api/demo",
    tags=["demo"],
    dependencies=[Depends(require_access_code)],
)


@router.get("/resume")
async def demo_resume() -> dict:
    return {"ok": True, "data": DEMO_RESUME, "demo": True}


@router.get("/jobs")
async def demo_jobs() -> dict:
    return {"ok": True, "data": DEMO_JOBS, "demo": True, "total": len(DEMO_JOBS)}


@router.post("/apply")
async def demo_apply(body: dict) -> dict:
    settings = get_settings()
    if not settings.demo_mode:
        return {"ok": False, "error": "演示模式未开启"}
    return {
        "ok": True,
        "demo": True,
        "data": {
            "application_id": f"demo-{body.get('job_id', 'unknown')}",
            "status": "submitted",
            "message": "演示投递成功；真实投递请连接猎聘 token。",
        },
    }
