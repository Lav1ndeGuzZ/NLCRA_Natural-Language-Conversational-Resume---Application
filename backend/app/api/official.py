from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException

from app.models.schemas import OfficialCrawlRequest, OfficialDiscoverRequest
from app.security import require_access_code, require_session_id
from app.services.company_search import companies_from_liepin, discover_company_sites
from app.services.crawler import CrawlError, crawl_company_site
from app.services.store import list_official_jobs, save_official_jobs

router = APIRouter(
    prefix="/api/official",
    tags=["official"],
    dependencies=[Depends(require_access_code)],
)


@router.post("/crawl")
async def crawl(
    body: OfficialCrawlRequest,
    session_id: str = Depends(require_session_id),
) -> dict:
    try:
        jobs = await crawl_company_site(
            body.url,
            company=body.company,
            keyword=body.keyword,
            max_jobs=body.max_jobs,
        )
    except CrawlError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    saved = save_official_jobs(session_id, jobs)
    return {"ok": True, "data": saved, "total": len(saved)}


@router.post("/discover")
async def discover(
    body: OfficialDiscoverRequest,
    x_user_token: str | None = Header(default=None),
) -> dict:
    candidates: list[dict] = []
    seen: set[str] = set()
    companies = [item.strip() for item in body.companies if item.strip()][:6]
    if not companies and x_user_token and body.keyword.strip():
        companies = await companies_from_liepin(x_user_token, body.keyword, body.city, limit=6)
    targets = list(companies)
    keyword = body.keyword.strip()
    if keyword and keyword not in targets:
        targets.append(keyword)
    if not targets:
        raise HTTPException(status_code=422, detail="请先输入岗位关键词或公司名。")
    for target in targets:
        try:
            items = await discover_company_sites(target, body.city, limit=3 if companies else body.limit)
        except Exception:
            continue
        for item in items:
            domain = item.get("domain") or ""
            if domain in seen:
                continue
            seen.add(domain)
            candidates.append(item)
    return {"ok": True, "data": candidates[: body.limit], "total": len(candidates[: body.limit])}


@router.get("/jobs")
async def jobs(session_id: str = Depends(require_session_id)) -> dict:
    items = list_official_jobs(session_id)
    return {"ok": True, "data": items, "total": len(items)}
