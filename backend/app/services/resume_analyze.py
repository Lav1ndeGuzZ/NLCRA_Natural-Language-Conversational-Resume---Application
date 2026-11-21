from __future__ import annotations

import re
from typing import Any

from app.models.resume import ResumeData, missing_fields

QUANT_RE = re.compile(r"\d|%|万|千|倍|人|天|月|年")


def analyze_resume(resume: dict[str, Any], target: str = "") -> dict[str, Any]:
    data = ResumeData.model_validate(resume)
    missing = missing_fields(data)
    work = [item for item in data.work if item.company or item.description or item.highlights]
    projects = [item for item in data.projects if item.name or item.description]
    education = [item for item in data.education if item.school or item.major]
    skills = [item.name for item in data.skills if item.name]
    highlights = [text for item in data.work for text in item.highlights if text.strip()]

    strengths: list[str] = []
    gaps: list[str] = []
    suggestions: list[str] = []

    if work:
        strengths.append(f"有 {len(work)} 段工作/实习经历，可支撑岗位经历描述。")
    if projects:
        strengths.append(f"有 {len(projects)} 个项目案例，可用于证明落地能力。")
    if education:
        strengths.append("教育背景完整，可放在简历前部。")
    if len(skills) >= 3:
        strengths.append(f"技能覆盖 {len(skills)} 项，具备关键词基础。")
    quantified = [item for item in highlights if QUANT_RE.search(item)]
    if quantified:
        strengths.append(f"有 {len(quantified)} 条带数字/规模的成果，说服力较好。")

    if "basics.contact" in missing:
        gaps.append("缺少手机号或邮箱，HR 无法联系。")
        suggestions.append("补充手机号/邮箱，并确认可接收面试通知。")
    if not data.selfAssess:
        gaps.append("缺少自我评价，简历开头没有一句话定位。")
        suggestions.append("用 2–3 句写清目标岗位、年限和最强能力，不要写空泛性格词。")
    if not education:
        gaps.append("缺少教育经历。")
        suggestions.append("补充学校、专业、学历和起止时间；成绩优秀可加排名/GPA。")
    elif not any(item.gpa for item in education):
        gaps.append("教育经历没有成绩/GPA/排名。")
        suggestions.append("如果成绩有优势，补充 GPA、排名或均分；没有优势可留空。")
    if not work and not projects:
        gaps.append("没有工作或项目经历，简历缺少证据。")
        suggestions.append("至少补 1 段项目：背景、你的动作、结果/数字。")
    if not data.skills:
        gaps.append("缺少技能清单。")
        suggestions.append("按岗位 JD 提取 5–8 个技能关键词，区分熟练/了解。")
    if not data.jobWant.jobtitle:
        gaps.append("缺少目标岗位，无法判断简历方向。")
        suggestions.append("补充目标岗位、城市和薪资区间。")
    if highlights and len(quantified) < max(1, len(highlights) // 3):
        gaps.append("成果量化不足，多数经历只有职责没有结果。")
        suggestions.append("把“负责/参与”改写成“动作 + 方法 + 数字结果”。")
    if target:
        target_lower = target.lower()
        if not any(target_lower in skill.lower() for skill in skills):
            gaps.append(f"技能清单中没有直接出现目标岗位关键词「{target}」。")
            suggestions.append("把目标岗位的核心关键词自然写进技能或经历，不要堆砌。")

    total = max(1, len(work) + len(projects) + len(education) + len(skills))
    score = 55 + min(20, len(work) * 6) + min(10, len(projects) * 5) + min(10, len(quantified) * 3)
    score -= len(missing) * 4
    score = max(20, min(96, score))
    if not strengths:
        strengths.append("目前是空白简历，先补一段真实经历。")
    if not gaps:
        gaps.append("未发现结构性缺失，但仍需按目标 JD 做关键词微调。")
    if not suggestions:
        suggestions.append("按目标岗位 JD 补充一条可量化成果后再导出。")

    return {
        "score": score,
        "missing": missing,
        "sections": {
            "work": len(work),
            "projects": len(projects),
            "education": len(education),
            "skills": len(skills),
            "highlights": len(highlights),
            "quantified": len(quantified),
            "total": total,
        },
        "strengths": strengths[:5],
        "gaps": gaps[:5],
        "suggestions": suggestions[:5],
    }
