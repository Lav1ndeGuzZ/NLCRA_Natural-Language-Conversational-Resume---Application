from __future__ import annotations

from io import BytesIO
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt


def _set_font(run, size: int | None = None, bold: bool = False) -> None:
    run.font.name = "Microsoft YaHei"
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    if size:
        run.font.size = Pt(size)
    run.bold = bold


def _heading(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(10)
    paragraph.paragraph_format.space_after = Pt(4)
    run = paragraph.add_run(text)
    _set_font(run, 12, True)
    # bottom border
    p_pr = paragraph._p.get_or_add_pPr()
    from docx.oxml import OxmlElement

    p_bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), "999999")
    p_bdr.append(bottom)
    p_pr.append(p_bdr)


def _bullet(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph(style="List Bullet")
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run(text)
    _set_font(run, 9)


def _paragraph(doc: Document, text: str, size: int = 9) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run(text)
    _set_font(run, size)


def _date_range(start: Any, end: Any) -> str:
    start_text = str(start or "").strip()
    end_text = str(end or "").strip()
    if start_text and end_text:
        return f"{start_text} – {end_text}"
    return start_text or end_text


def build_resume_docx(resume: dict[str, Any]) -> bytes:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = section.bottom_margin = section.left_margin = section.right_margin = 0

    basics = resume.get("basics") or {}
    name = str(basics.get("name") or "姓名")
    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(name)
    _set_font(run, 20, True)

    contact_parts = [
        str(basics.get("phone") or "").strip(),
        str(basics.get("email") or "").strip(),
        str(basics.get("city") or "").strip(),
        str(basics.get("wechat") or "").strip(),
    ]
    contact = "  ·  ".join(part for part in contact_parts if part)
    if contact:
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(contact)
        _set_font(run, 9)

    summary = str(resume.get("selfAssess") or "").strip()
    if summary:
        _heading(doc, "自我评价")
        _paragraph(doc, summary)

    education = resume.get("education") or []
    if education:
        _heading(doc, "教育经历")
        for item in education:
            if not isinstance(item, dict):
                continue
            line = " · ".join(
                part
                for part in [
                    str(item.get("school") or "").strip(),
                    str(item.get("major") or "").strip(),
                    str(item.get("degree") or "").strip(),
                    _date_range(item.get("start"), item.get("end")),
                ]
                if part
            )
            _paragraph(doc, line, 10)

    work = resume.get("work") or []
    if work:
        _heading(doc, "工作经历")
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
            _paragraph(doc, line, 10)
            description = str(item.get("description") or "").strip()
            if description:
                _paragraph(doc, description)
            for highlight in item.get("highlights") or []:
                text = str(highlight).strip()
                if text:
                    _bullet(doc, text)

    projects = resume.get("projects") or []
    if projects:
        _heading(doc, "项目经历")
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
            _paragraph(doc, line, 10)
            description = str(item.get("description") or "").strip()
            if description:
                _paragraph(doc, description)
            tech = item.get("tech") or []
            if tech:
                _paragraph(doc, "技术栈：" + "、".join(str(t) for t in tech))

    skills = resume.get("skills") or []
    if skills:
        _heading(doc, "专业技能")
        skill_text = "、".join(
            f"{item.get('name', '')}（{item.get('level', '')}）"
            if isinstance(item, dict) and item.get("level")
            else str(item.get("name", "")) if isinstance(item, dict) else str(item)
            for item in skills
        )
        _paragraph(doc, skill_text)

    job_want = resume.get("jobWant") or {}
    if job_want:
        _heading(doc, "求职意向")
        parts = [
            str(job_want.get("jobtitle") or "").strip(),
            str(job_want.get("city") or "").strip(),
            f"{job_want.get('salaryLow', '')}-{job_want.get('salaryHigh', '')}K"
            if job_want.get("salaryLow") or job_want.get("salaryHigh")
            else "",
            str(job_want.get("workType") or "").strip(),
        ]
        _paragraph(doc, " · ".join(part for part in parts if part))

    buffer = BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
