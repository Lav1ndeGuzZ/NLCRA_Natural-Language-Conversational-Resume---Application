from __future__ import annotations

import json
import re
from typing import Any

from app.models.match import JobBrief, JobMatch, _RawMatches
from app.models.resume import ResumeData
from app.services.deepseek import DeepSeekClient

MATCH_SYSTEM_PROMPT = """你是招聘匹配评估器。给定一份简历摘要和一批职位，逐条评估匹配度。

评分标准（总分 100）：
- 硬技能与岗位要求的重合度：45 分
- 经历年限与岗位级别的匹配：25 分
- 行业/业务场景相关性：20 分
- 地点与薪资吻合度：10 分

输出必须是 JSON：
{"results": [{"index": 0, "score": 0, "matched": ["..."], "missing": ["..."], "suggestion": "..."}]}

规则：
1. results 顺序与输入职位一一对应，index 与输入下标一致，不要遗漏。
2. matched 只写简历中确有证据的项，每条不超过 12 字。
3. missing 写岗位要求但简历中缺失的能力，每条不超过 12 字。
4. suggestion 一句话，指出最该补的一条，可操作、具体，不超过 40 字。
5. 简历没有证据支持的，不要假设；分数不要虚高，也不要一律给低分。
6. 只输出 JSON，不要 Markdown。"""


def resume_digest(resume: ResumeData) -> str:
    basics = resume.basics
    parts: list[str] = []
    head = " / ".join(
        item for item in [basics.name, basics.city, resume.jobWant.jobtitle] if item
    )
    if head:
        parts.append(f"基本信息：{head}")

    if resume.selfAssess:
        parts.append(f"自我评价：{resume.selfAssess}")

    if resume.education:
        edu = "；".join(
            " ".join(item for item in [item.school, item.major, item.degree] if item)
            for item in resume.education
        )
        parts.append(f"教育：{edu}")

    for item in resume.work:
        line = f"工作：{item.company} {item.title}（{item.start}~{item.end}）{item.description}"
        if item.highlights:
            line += "。成果：" + "；".join(item.highlights)
        parts.append(line.strip())

    for item in resume.projects:
        line = f"项目：{item.name} {item.role} {item.description}"
        if item.tech:
            line += "。技术：" + "、".join(item.tech)
        parts.append(line.strip())

    if resume.skills:
        parts.append("技能：" + "、".join(item.name for item in resume.skills if item.name))

    job_want = resume.jobWant
    salary = (
        f"{job_want.salaryLow or ''}-{job_want.salaryHigh or ''}K" if job_want.salaryLow or job_want.salaryHigh else ""
    )
    want = " / ".join(item for item in [job_want.city, salary, job_want.workType] if item)
    if want:
        parts.append(f"求职意向：{want}")

    return "\n".join(parts)


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[\s,，、/·;；:：()（）]+", value.lower()) if len(token) >= 2}


def rule_match(resume: ResumeData, job: JobBrief) -> JobMatch:
    """Deterministic fallback scorer: explainable, no model required."""
    evidence_text = resume_digest(resume).lower()
    evidence_tokens = _tokens(evidence_text)
    job_text = " ".join(
        [job.title, job.company, job.city, job.description, *job.tags]
    ).lower()

    matched: list[str] = []
    missing: list[str] = []
    for tag in job.tags[:8]:
        tag_text = tag.strip()
        if not tag_text:
            continue
        probe = tag_text.lower()
        if probe in evidence_text or _tokens(probe) & evidence_tokens:
            matched.append(tag_text)
        else:
            missing.append(tag_text)

    overlap = len(matched) / max(1, len(matched) + len(missing))
    score = 45 + overlap * 40

    if resume.jobWant.city and job.city and resume.jobWant.city[:2] in job.city:
        score += 8
    if job.experience and any(part in job_text for part in ("不限", "应届")):
        score += 3

    target = resume.jobWant.jobtitle
    if target and any(token in job_text for token in _tokens(target)):
        score += 7

    score = int(max(20, min(96, score)))
    suggestion = (
        f"补一条与「{missing[0]}」相关的量化成果" if missing else "岗位要求基本覆盖，可以优先投递"
    )
    return JobMatch(
        index=0,
        score=score,
        matched=matched[:6],
        missing=missing[:6],
        suggestion=suggestion,
    )


def _loads(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("模型未返回 JSON")
    return json.loads(text[start : end + 1])


def _prompt_payload(resume: ResumeData, jobs: list[JobBrief]) -> str:
    job_lines = [
        {
            "index": index,
            "title": job.title,
            "company": job.company,
            "city": job.city,
            "salary": job.salary,
            "experience": job.experience,
            "education": job.education,
            "tags": job.tags,
            "description": job.description[:400],
        }
        for index, job in enumerate(jobs)
    ]
    return (
        "【简历摘要】\n"
        + resume_digest(resume)
        + "\n\n【候选职位】\n"
        + json.dumps(job_lines, ensure_ascii=False)
    )


async def llm_match(resume: ResumeData, jobs: list[JobBrief]) -> list[JobMatch]:
    raw = await DeepSeekClient().chat(
        [
            {"role": "system", "content": MATCH_SYSTEM_PROMPT},
            {"role": "user", "content": _prompt_payload(resume, jobs)},
        ],
        temperature=0.2,
        json_mode=True,
    )
    parsed = _RawMatches.model_validate(_loads(raw))
    by_index = {item.index: item for item in parsed.results if 0 <= item.index < len(jobs)}

    results: list[JobMatch] = []
    for index, job in enumerate(jobs):
        item = by_index.get(index)
        if item is None:
            fallback = rule_match(resume, job)
            fallback.index = index
            results.append(fallback)
            continue
        item.index = index
        item.score = max(0, min(100, item.score))
        results.append(item)
    return results
