from __future__ import annotations

from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from app.services.resume_templates import normalize_template

FONT = "STSong-Light"
ACCENTS = {
    "classic": "#0F172A",
    "modern": "#2563EB",
    "compact": "#0F766E",
    "executive": "#7C2D12",
}

try:
    pdfmetrics.registerFont(UnicodeCIDFont(FONT))
except Exception:
    # Registration can fail if the CID font is unavailable on a minimal host.
    FONT = "Helvetica"


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text or "")).replace("\n", "<br/>"), style)


def _date_range(start: Any, end: Any) -> str:
    left = str(start or "").strip()
    right = str(end or "").strip()
    return f"{left} – {right}" if left and right else left or right


def build_resume_pdf(resume: dict[str, Any], template_id: str = "classic") -> bytes:
    template = normalize_template(template_id)
    accent = ACCENTS[template]
    compact = template == "compact"

    buffer = BytesIO()
    margin = 1.4 * cm if compact else 1.8 * cm
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title=str((resume.get("basics") or {}).get("name") or "简历"),
    )

    name_style = ParagraphStyle(
        "name",
        fontName=FONT,
        fontSize=20 if not compact else 18,
        leading=25 if not compact else 22,
        alignment=TA_LEFT if template == "modern" else TA_CENTER,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=4,
    )
    contact_style = ParagraphStyle(
        "contact",
        fontName=FONT,
        fontSize=9,
        leading=13,
        alignment=TA_LEFT if template == "modern" else TA_CENTER,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=8,
    )
    heading_style = ParagraphStyle(
        "heading",
        fontName=FONT,
        fontSize=11 if compact else 12,
        leading=15,
        textColor=colors.HexColor(accent),
        spaceBefore=7,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "body",
        fontName=FONT,
        fontSize=8.5 if compact else 9.5,
        leading=13 if compact else 14.5,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=2,
    )
    bullet_style = ParagraphStyle(
        "bullet",
        parent=body_style,
        leftIndent=12,
        bulletIndent=4,
    )

    story: list[Any] = []
    basics = resume.get("basics") or {}
    story.append(_p(basics.get("name") or "姓名", name_style))
    contact = "  ·  ".join(
        str(basics.get(key) or "").strip()
        for key in ("phone", "email", "city", "wechat")
        if str(basics.get(key) or "").strip()
    )
    if contact:
        story.append(_p(contact, contact_style))

    def heading(text: str) -> None:
        story.append(_p(text, heading_style))

    def paragraph(text: Any) -> None:
        if str(text or "").strip():
            story.append(_p(text, body_style))

    def bullets(items: list[Any]) -> None:
        for item in items:
            if str(item or "").strip():
                story.append(Paragraph(f"• {escape(str(item))}", bullet_style))

    summary = str(resume.get("selfAssess") or "").strip()
    if summary:
        heading("自我评价")
        paragraph(summary)

    education = resume.get("education") or []
    if education:
        heading("教育经历")
        for item in education:
            if not isinstance(item, dict):
                continue
            line = " · ".join(
                part
                for part in [
                    str(item.get("school") or "").strip(),
                    str(item.get("major") or "").strip(),
                    str(item.get("degree") or "").strip(),
                    str(item.get("gpa") or "").strip(),
                    _date_range(item.get("start"), item.get("end")),
                ]
                if part
            )
            paragraph(line)

    work = resume.get("work") or []
    if work:
        heading("工作经历")
        for item in work:
            if not isinstance(item, dict):
                continue
            line = " · ".join(
                part
                for part in [
                    str(item.get("company") or "").strip(),
                    str(item.get("title") or "").strip(),
                    _date_range(item.get("start"), item.get("end")),
                ]
                if part
            )
            paragraph(line)
            paragraph(item.get("description"))
            bullets(item.get("highlights") or [])

    projects = resume.get("projects") or []
    if projects:
        heading("项目经历")
        for item in projects:
            if not isinstance(item, dict):
                continue
            line = " · ".join(
                part
                for part in [
                    str(item.get("name") or "").strip(),
                    str(item.get("role") or "").strip(),
                    _date_range(item.get("start"), item.get("end")),
                ]
                if part
            )
            paragraph(line)
            paragraph(item.get("description"))
            tech = item.get("tech") or []
            if tech:
                paragraph("技术栈：" + "、".join(str(t) for t in tech))

    skills = resume.get("skills") or []
    if skills:
        heading("专业技能")
        text = "、".join(
            f"{item.get('name', '')}（{item.get('level', '')}）"
            if isinstance(item, dict) and item.get("level")
            else str(item.get("name", "")) if isinstance(item, dict) else str(item)
            for item in skills
        )
        paragraph(text)

    job_want = resume.get("jobWant") or {}
    if job_want:
        heading("求职意向")
        parts = [
            str(job_want.get("jobtitle") or "").strip(),
            str(job_want.get("city") or "").strip(),
            f"{job_want.get('salaryLow', '')}-{job_want.get('salaryHigh', '')}K"
            if job_want.get("salaryLow") or job_want.get("salaryHigh")
            else "",
            str(job_want.get("workType") or "").strip(),
        ]
        paragraph(" · ".join(part for part in parts if part))

    if not story:
        story.append(_p("简历内容为空", body_style))
    story.append(Spacer(1, 6))
    doc.build(story)
    return buffer.getvalue()
