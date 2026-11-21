from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

import httpx

BLOCKED_DOMAINS = {
    "zhipin.com", "zhaopin.com", "liepin.com", "51job.com", "lagou.com", "jobui.com",
    "ganji.com", "58.com", "shixiseng.com", "yingjiesheng.com", "dajie.com",
    "linkedin.com", "maimai.cn", "kanzhun.com", "so.com", "360.cn", "360.com",
    "bing.com", "baidu.com", "zhihu.com", "woshipm.com", "csdn.net", "jianshu.com",
    "sohu.com", "163.com", "qq.com", "weibo.com", "bilibili.com", "xiaohongshu.com",
    "douban.com", "gov.cn", "edu.cn", "china.com", "ifeng.com", "thepaper.cn",
    "gaoxiaojob.com", "aiqicha.baidu.com", "qcc.com", "tianyancha.com",
    "360kan.com", "qlrc.com", "puxiang.com", "chanpinpai.com", "zdic.net",
    "bendibao.com", "mafengwo.cn", "meet-in-shanghai.net",
}
JOB_PATH_WORDS = ("job", "jobs", "career", "careers", "recruit", "zhaopin", "join", "hr", "position")
JOB_TITLE_WORDS = ("招聘", "加入我们", "职位", "岗位", "人才", "career", "job", "校招", "社招")


class _LinkParser(HTMLParser):
    """Collect direct result links from 360 (data-mdurl) and Bing (h2 > a)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.results: list[dict[str, str]] = []
        self._url = ""
        self._text: list[str] = []
        self._in_anchor = False
        self._in_h2 = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = dict(attrs)
        if tag == "h2":
            self._in_h2 = True
        if tag != "a":
            return
        url = data.get("data-mdurl") or ""
        if not url and self._in_h2:
            url = data.get("href") or ""
        if not url.startswith(("http://", "https://")):
            return
        self._url = url
        self._text = []
        self._in_anchor = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._in_anchor:
            text = re.sub(r"\s+", " ", " ".join(self._text)).strip(" 【】[]")
            if text and self._url:
                self.results.append({"url": self._url, "title": text})
            self._in_anchor = False
            self._url = ""
            self._text = []
        if tag == "h2":
            self._in_h2 = False

    def handle_data(self, data: str) -> None:
        if self._in_anchor:
            text = re.sub(r"\s+", " ", data).strip()
            if text:
                self._text.append(text)


def _domain(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _blocked(domain: str) -> bool:
    return any(domain == item or domain.endswith("." + item) for item in BLOCKED_DOMAINS)


def _company_from_title(title: str, domain: str) -> str:
    for sep in (" - ", "—", "｜", "|", "_"):
        if sep in title:
            left, right = title.split(sep, 1)
            return (right if len(right) >= 2 else left).strip()[:80]
    return domain.split(".")[0][:80]


def _score(item: dict[str, str]) -> int:
    url = item["url"].lower()
    title = item["title"].lower()
    score = 0
    if any(word in url for word in JOB_PATH_WORDS):
        score += 5
    if any(word in title for word in JOB_TITLE_WORDS):
        score += 4
    if url.count("/") <= 3:
        score += 1
    return score


def _queries(keyword: str, city: str) -> list[str]:
    parts = [keyword.strip()]
    if city.strip() and city.strip() not in keyword:
        parts.append(city.strip())
    base = " ".join(parts)
    return [
        f"{base} 招聘 官网",
        f"{base} 人才招聘 加入我们",
        f"{base} 校园招聘 社会招聘",
    ]


async def _fetch(client: httpx.AsyncClient, engine: str, query: str) -> list[dict[str, str]]:
    if engine == "360":
        response = await client.get("https://www.so.com/s", params={"q": query})
    else:
        response = await client.get("https://www.bing.com/search", params={"q": query, "setlang": "zh-CN"})
    response.raise_for_status()
    parser = _LinkParser()
    parser.feed(response.text)
    return parser.results


async def discover_company_sites(
    keyword: str,
    city: str = "",
    limit: int = 8,
) -> list[dict[str, Any]]:
    keyword = keyword.strip()
    if not keyword:
        raise ValueError("请先输入岗位关键词，或先在简历中填写求职意向。")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
    }
    candidates: dict[str, dict[str, Any]] = {}
    async with httpx.AsyncClient(headers=headers, timeout=20, follow_redirects=True) as client:
        for query in _queries(keyword, city)[:2]:
            for engine in ("360", "bing"):
                try:
                    raw = await _fetch(client, engine, query)
                except httpx.HTTPError:
                    continue
                for item in raw:
                    domain = _domain(item["url"])
                    if not domain or _blocked(domain) or domain in candidates:
                        continue
                    title_lower = item["title"].lower()
                    url_lower = item["url"].lower()
                    if any(part in url_lower for part in ("/forum", "/club", "/bbs", "/news", "/support", "/wiki")):
                        continue
                    if not any(word in title_lower for word in JOB_TITLE_WORDS) and not any(word in url_lower for word in JOB_PATH_WORDS):
                        continue
                    candidates[domain] = {
                        "company": _company_from_title(item["title"], domain),
                        "domain": domain,
                        "url": item["url"],
                        "title": item["title"][:160],
                        "query": query,
                        "engine": engine,
                    }
            if len(candidates) >= limit:
                break

    items = sorted(candidates.values(), key=_score, reverse=True)
    return items[: max(1, min(limit, 12))]


async def companies_from_liepin(token: str, keyword: str, city: str = "", limit: int = 6) -> list[str]:
    """Use the user's Liepin search results as real company seeds for discovery."""
    from app.services.liepin import LiepinClient, LiepinError

    payload = {"jobName": keyword.strip(), "address": city.strip(), "page": 0}
    payload = {key: value for key, value in payload.items() if value not in (None, "")}
    try:
        data = await LiepinClient(token).search_jobs(payload)
    except (LiepinError, Exception):
        return []

    def collect(value: Any) -> list[str]:
        found: list[str] = []
        if isinstance(value, dict):
            for key in ("company", "companyName", "compName", "company_name"):
                name = str(value.get(key) or "").strip()
                if name:
                    found.append(name)
            for item in value.values():
                found.extend(collect(item))
        elif isinstance(value, list):
            for item in value:
                found.extend(collect(item))
        return found

    companies: list[str] = []
    for name in collect(data):
        if name not in companies:
            companies.append(name)
    return companies[: max(1, min(limit, 10))]
