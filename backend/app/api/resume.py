from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.demo_data import DEMO_RESUME
from app.models.resume import ResumeData, missing_fields
from app.models.schemas import (
    ExtractRequest,
    ExtractResponse,
    ResumeExportRequest,
    SaveResumeRequest,
)
from app.security import require_access_code, require_session_id
from app.services.deepseek import DeepSeekError, DeepSeekNotConfigured
from app.services.extract import ExtractionError, extract_resume
from app.services.resume_docx import build_resume_docx
from app.services.store import load_resume, save_resume

router = APIRouter(
    prefix="/api/resume",
    tags=["resume"],
    dependencies=[Depends(require_access_code)],
)


@router.post("/extract", response_model=ExtractResponse)
async def extract(body: ExtractRequest) -> ExtractResponse:
    settings = get_settings()
    messages = [message.model_dump() for message in body.messages]

    if not settings.deepseek_configured:
        if settings.demo_mode:
            demo = ResumeData.model_validate(DEMO_RESUME)
            return ExtractResponse(
                resume=demo.model_dump(),
                missing=missing_fields(demo),
                model="demo",
                demo=True,
            )
        raise HTTPException(status_code=503, detail="服务端未配置 DEEPSEEK_API_KEY。")

    try:
        resume = await extract_resume(messages)
    except ExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except DeepSeekNotConfigured as exc:
        raise HTTPException(status_code=503, detail="服务端未配置 DEEPSEEK_API_KEY。") from exc
    except DeepSeekError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return ExtractResponse(
        resume=resume.model_dump(),
        missing=missing_fields(resume),
        model=settings.deepseek_model,
    )


@router.get("")
async def read_resume(session_id: str = Depends(require_session_id)) -> dict:
    resume, updated_at = load_resume(session_id)
    return {"ok": True, "data": resume, "updated_at": updated_at}


@router.put("")
async def write_resume(
    body: SaveResumeRequest,
    session_id: str = Depends(require_session_id),
) -> dict:
    normalized = ResumeData.model_validate(body.resume).model_dump()
    updated_at = save_resume(session_id, normalized)
    return {
        "ok": True,
        "updated_at": updated_at,
        "missing": missing_fields(ResumeData.model_validate(normalized)),
    }


@router.post("/export/docx")
async def export_docx(body: ResumeExportRequest) -> StreamingResponse:
    try:
        content = build_resume_docx(body.resume)
    except Exception as exc:  # noqa: BLE001 - export errors should be user-facing
        raise HTTPException(status_code=500, detail=f"DOCX 生成失败：{exc}") from exc

    filename = (body.filename or "resume").strip() or "resume"
    filename = filename.replace("/", "-").replace("\\", "-")[:80]
    encoded = quote(f"{filename}.docx")
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=\"resume.docx\"; filename*=UTF-8''{encoded}",
        },
    )


@router.post("/export/pdf")
async def export_pdf() -> dict:
    raise HTTPException(
        status_code=501,
        detail="PDF 导出将在 Docker/Linux 环境接入 WeasyPrint；当前请使用 DOCX 或浏览器打印。",
    )
