from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from app.services.emailer import EMAIL_RE

JOB_WORDS = ("招聘", "职位", "岗位", "社会招聘", "校园招聘", "加入我们", "人才", "job", "career", "recruit", "position")
CITY_WORDS = (
    "北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉", "苏州", "西安",
    "重庆", "天津", "长沙", "郑州", "合肥", "厦门", "青岛", "宁波", "无锡", "东莞",
)
SALARY_RE = re.compile(r"\d{1,3}\s*[-–—~至]\s*\d{1,3}\s*[kK万]|面议")
BAD_ANCHORS = {
    "skip to content", "close", "menu", "search", "login", "home", "jobs", "careers",
    "all jobs", "view all", "read more", "learn more", "apply", "back", "next", "previous",
}


class CrawlError(Exception):
    pass


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self._in_title = False
        self._href: str | None = None
        self._anchor_parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if tag == "title":
            self._in_title = True
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._anchor_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag == "a" and self._href:
            text = re.sub(r"\s+", " ", " ".join(self._anchor_parts)).strip()
            self.links.append((self._href, text))
            self._href = None
            self._anchor_parts = []

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if not text:
            return
        if self._in_title:
            self.title_parts.append(text)
        self.text_parts.append(text)
        if self._href is not None:
            self._anchor_parts.append(text)

    @property
    def title(self) -> str:
        return " ".join(self.title_parts).strip()

    @property
    def text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self.text_parts)).strip()


def _is_public_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    host = parsed.hostname
    if host in {"localhost", "127.0.0.1", "::1"}:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    return True


def _pick_city(text: str) -> str:
    for city in CITY_WORDS:
        if city in text:
            return city
    return ""


def _pick_salary(text: str) -> str:
    match = SALARY_RE.search(text)
    return match.group(0).replace(" ", "") if match else ""


def _candidate_links(base_url: str, links: list[tuple[str, str]], keyword: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    keyword_lower = keyword.lower().strip()
    for href, text in links:
        absolute = urljoin(base_url, href)
        if not absolute.startswith(("http://", "https://")) or absolute in seen:
            continue
        if href.startswith("#") or text.strip().lower() in BAD_ANCHORS:
            continue
        lower_url = absolute.lower()
        if any(part in lower_url for part in ("/jobs/type/", "/jobs/category/", "/jobs/types/", "/jobs/categories/", "/locations/", "/location/", "/companies/", "/company/")):
            continue
        if "/jobs/" in lower_url and not re.search(r"/jobs/\d+", lower_url):
            continue
        if not _is_public_url(absolute):
            continue
        blob = f"{text} {absolute}".lower()
        if keyword_lower and keyword_lower not in blob:
            continue
        if not keyword_lower and not any(word in blob for word in JOB_WORDS):
            continue
        if len(text) < 2 or len(text) > 80:
            continue
        seen.add(absolute)
        found.append((absolute, text))
        if len(found) >= 12:
            break
    return found


async def crawl_company_site(
    url: str,
    company: str = "",
    keyword: str = "",
    max_jobs: int = 8,
) -> list[dict[str, Any]]:
    """Crawl a public careers page, then follow job links to find recruiting emails.

    This is deliberately bounded: one listing page + up to ``max_jobs`` detail pages.
    It is not a general-purpose crawler and refuses private/loopback hosts.
    """
    if not _is_public_url(url):
        raise CrawlError("只支持公开的 http/https 官网地址，且不能是内网或 localhost。")
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; NLCRA-CareerBot/1.0; +https://example.invalid)",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
    }
    timeout = httpx.Timeout(20.0, connect=10.0)
    try:
        async with httpx.AsyncClient(headers=headers, timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            html = response.text
            listing = _PageParser()
            listing.feed(html)
            page_text = listing.text
            page_emails = EMAIL_RE.findall(html)
            company_name = company.strip() or listing.title.split("-")[0].strip() or urlparse(url).hostname or ""
            links = _candidate_links(str(response.url), listing.links, keyword)
            if not links:
                # Some pages are single-page job boards; expose the page itself if it looks like a job page.
                if any(word in page_text.lower() for word in JOB_WORDS):
                    return [
                        {
                            "title": listing.title or "官网招聘职位",
                            "company": company_name,
                            "city": _pick_city(page_text),
                            "salary": _pick_salary(page_text),
                            "url": str(response.url),
                            "email": page_emails[0] if page_emails else "",
                            "description": page_text[:1200],
                        }
                    ]
                raise CrawlError("没有在页面上识别到招聘职位链接；请把职位列表页或具体职位页作为地址。")

            jobs: list[dict[str, Any]] = []
            for job_url, anchor_text in links[: max(1, min(max_jobs, 12))]:
                try:
                    detail_response = await client.get(job_url)
                    detail_response.raise_for_status()
                    detail = _PageParser()
                    detail.feed(detail_response.text)
                    detail_text = detail.text
                    emails = EMAIL_RE.findall(detail_response.text) or page_emails
                    title = detail.title or anchor_text
                    # Use the anchor when the <title> is a generic company/site title.
                    if anchor_text and (len(title) > 70 or "招聘" not in title and len(anchor_text) <= 50):
                        title = anchor_text
                    jobs.append(
                        {
                            "title": title.strip()[:120],
                            "company": company_name,
                            "city": _pick_city(detail_text) or _pick_city(page_text),
                            "salary": _pick_salary(detail_text) or _pick_salary(page_text),
                            "url": str(detail_response.url),
                            "email": emails[0] if emails else "",
                            "description": detail_text[:1500],
                        }
                    )
                except (httpx.HTTPError, CrawlError):
                    jobs.append(
                        {
                            "title": anchor_text.strip()[:120],
                            "company": company_name,
                            "city": _pick_city(page_text),
                            "salary": _pick_salary(page_text),
                            "url": job_url,
                            "email": page_emails[0] if page_emails else "",
                            "description": "",
                        }
                    )
                await asyncio.sleep(0.2)
            return jobs
    except httpx.HTTPError as exc:
        raise CrawlError(f"官网抓取失败：{exc}") from exc
