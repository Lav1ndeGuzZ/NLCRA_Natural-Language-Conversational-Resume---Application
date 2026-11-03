from fastapi import APIRouter, Depends

from app.config import get_settings
from app.models.schemas import HealthResponse
from app.security import require_access_code

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        version=settings.version,
        environment=settings.environment,
        demo_mode=settings.demo_mode,
        deepseek_configured=settings.deepseek_configured,
        access_code_required=bool(settings.app_access_code.strip()),
        liepin_base_url=settings.liepin_base_url,
    )


@router.get("/config")
async def public_config(_: None = Depends(require_access_code)) -> dict:
    settings = get_settings()
    return {
        "app_name": settings.app_name,
        "version": settings.version,
        "demo_mode": settings.demo_mode,
        "deepseek_configured": settings.deepseek_configured,
        "deepseek_model": settings.deepseek_model,
        "access_code_required": bool(settings.app_access_code.strip()),
    }
