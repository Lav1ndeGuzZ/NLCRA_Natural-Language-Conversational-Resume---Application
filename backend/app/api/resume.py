from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import ResumeExportRequest
from app.security import require_access_code
from app.services.resume_docx import build_resume_docx

router = APIRouter(
    prefix="/api/resume",
    tags=["resume"],
    dependencies=[Depends(require_access_code)],
)


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
