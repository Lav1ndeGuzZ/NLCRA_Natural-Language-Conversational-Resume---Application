from __future__ import annotations

from io import BytesIO
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from app.services.resume_templates import normalize_template

TEMPLATE_STYLE = {
    "classic": {
        "heading_color": "0F172A",
        "heading_size": 12,
        "border": True,
        "name_align": WD_ALIGN_PARAGRAPH.CENTER,
        "margin": 0.0,
        "title_size": 20,
        "body_size": 9,
    },
    "modern": {
        "heading_color": "2563EB",
        "heading_size": 11.5,
        "border": False,
        "name_align": WD_ALIGN_PARAGRAPH.LEFT,
        "margin": 0.0,
        "title_size": 21,
        "body_size": 9,
    },
    "compact": {
        "heading_color": "0F766E",
        "heading_size": 10.5,
        "border": False,
        "name_align": WD_ALIGN_PARAGRAPH.CENTER,
        "margin": 0.8,
        "title_size": 18,
        "body_size": 8.5,
    },
    "executive": {
        "heading_color": "7C2D12",
        "heading_size": 12,
        "border": True,
        "name_align": WD_ALIGN_PARAGRAPH.CENTER,
        "margin": 0.0,
        "title_size": 20,
        "body_size": 9,
    },
}


def _style(template_id: str | None) -> dict[str, Any]:
    return TEMPLATE_STYLE[normalize_template(template_id)]


def _set_font(run, size: int | None = None, bold: bool = False, color: str | None = None) -> None:
    run.font.name = "Microsoft YaHei"
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    run.bold = bold


def _heading(doc: Document, text: str, style: dict[str, Any]) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(8 if style["border"] else 6)
    paragraph.paragraph_format.space_after = Pt(3)
    run = paragraph.add_run(text)
    _set_font(run, style["heading_size"], True, style["heading_color"])
    if style["border"]:
        p_pr = paragraph._p.get_or_add_pPr()
        p_bdr = OxmlElement("w:pBdr")
        bottom = OxmlElement("w:bottom")
        bottom.set(qn("w:val"), "single")
        bottom.set(qn("w:sz"), "6")
        bottom.set(qn("w:space"), "2")
        bottom.set(qn("w:color"), "CBD5E1")
        p_bdr.append(bottom)
        p_pr.append(p_bdr)


def _bullet(doc: Document, text: str, style: dict[str, Any]) -> None:
    paragraph = doc.add_paragraph(style="List Bullet")
    paragraph.paragraph_format.space_after = Pt(1)
    run = paragraph.add_run(text)
    _set_font(run, style["body_size"], color="334155")


def _paragraph(doc: Document, text: str, style: dict[str, Any], size: int | None = None) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run(text)
    _set_font(run, size or style["body_size"], color="1E293B")


def _date_range(start: Any, end: Any) -> str:
    start_text = str(start or "").strip()
    end_text = str(end or "").strip()
    if start_text and end_text:
        return f"{start_text} – {end_text}"
    return start_text or end_text


def build_resume_docx(resume: dict[str, Any], template_id: str = "classic") -> bytes:
    style = _style(template_id)
    doc = Document()
    section = doc.sections[0]
    if style["margin"]:
        section.top_margin = section.bottom_margin = Cm(style["margin"])
        section.left_margin = section.right_margin = Cm(style["margin"] + 0.4)
    else:
        section.top_margin = section.bottom_margin = Cm(0.4)
        section.left_margin = section.right_margin = Cm(0.8)

    normal = doc.styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(style["body_size"])

    basics = resume.get("basics") or {}
    name = str(basics.get("name") or "姓名")
    title = doc.add_paragraph()
    title.alignment = style["name_align"]
    title.paragraph_format.space_after = Pt(2)
    run = title.add_run(name)
    _set_font(run, style["title_size"], True, "0F172A")

    contact_parts = [
        str(basics.get("phone") or "").strip(),
        str(basics.get("email") or "").strip(),
        str(basics.get("city") or "").strip(),
        str(basics.get("wechat") or "").strip(),
    ]
    contact = "  ·  ".join(part for part in contact_parts if part)
    if contact:
        paragraph = doc.add_paragraph()
        paragraph.alignment = style["name_align"]
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(contact)
        _set_font(run, style["body_size"], color="64748B")

    summary = str(resume.get("selfAssess") or "").strip()
    if summary:
        _heading(doc, "自我评价", style)
        _paragraph(doc, summary, style)

    education = resume.get("education") or []
    if education:
        _heading(doc, "教育经历", style)
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
            _paragraph(doc, line, style, style["body_size"] + 1)

    work = resume.get("work") or []
    if work:
        _heading(doc, "工作经历", style)
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
            _paragraph(doc, line, style, style["body_size"] + 1)
            description = str(item.get("description") or "").strip()
            if description:
                _paragraph(doc, description, style)
            for highlight in item.get("highlights") or []:
                text = str(highlight).strip()
                if text:
                    _bullet(doc, text, style)

    projects = resume.get("projects") or []
    if projects:
        _heading(doc, "项目经历", style)
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
            _paragraph(doc, line, style, style["body_size"] + 1)
            description = str(item.get("description") or "").strip()
            if description:
                _paragraph(doc, description, style)
            tech = item.get("tech") or []
            if tech:
                _paragraph(doc, "技术栈：" + "、".join(str(t) for t in tech), style)

    skills = resume.get("skills") or []
    if skills:
        _heading(doc, "专业技能", style)
        skill_text = "、".join(
            f"{item.get('name', '')}（{item.get('level', '')}）"
            if isinstance(item, dict) and item.get("level")
            else str(item.get("name", "")) if isinstance(item, dict) else str(item)
            for item in skills
        )
        _paragraph(doc, skill_text, style)

    job_want = resume.get("jobWant") or {}
    if job_want:
        _heading(doc, "求职意向", style)
        parts = [
            str(job_want.get("jobtitle") or "").strip(),
            str(job_want.get("city") or "").strip(),
            f"{job_want.get('salaryLow', '')}-{job_want.get('salaryHigh', '')}K"
            if job_want.get("salaryLow") or job_want.get("salaryHigh")
            else "",
            str(job_want.get("workType") or "").strip(),
        ]
        _paragraph(doc, " · ".join(part for part in parts if part), style)

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
