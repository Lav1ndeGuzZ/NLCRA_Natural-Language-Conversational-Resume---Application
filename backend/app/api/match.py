from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.models.match import MatchRequest, MatchResponse
from app.models.resume import ResumeData
from app.security import require_access_code
from app.services.deepseek import DeepSeekError, DeepSeekNotConfigured
from app.services.match import llm_match, rule_match

router = APIRouter(
    prefix="/api/match",
    tags=["match"],
    dependencies=[Depends(require_access_code)],
)


@router.post("/score", response_model=MatchResponse)
async def score_jobs(body: MatchRequest) -> MatchResponse:
    settings = get_settings()
    resume = ResumeData.model_validate(body.resume)

    if not settings.deepseek_configured:
        results = []
        for index, job in enumerate(body.jobs):
            item = rule_match(resume, job)
            item.index = index
            results.append(item)
        return MatchResponse(results=results, model="rule", demo=True)

    try:
        results = await llm_match(resume, body.jobs)
    except (DeepSeekNotConfigured, DeepSeekError, ValueError) as exc:
        results = []
        for index, job in enumerate(body.jobs):
            item = rule_match(resume, job)
            item.index = index
            results.append(item)
        return MatchResponse(results=results, model="rule", demo=True)
    except Exception as exc:  # noqa: BLE001 - degrade instead of blocking the user
        raise HTTPException(status_code=502, detail=f"匹配分析失败：{exc}") from exc

    return MatchResponse(results=results, model=settings.deepseek_model)
