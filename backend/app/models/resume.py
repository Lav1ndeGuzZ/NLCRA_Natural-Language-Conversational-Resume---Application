from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool):
        return ""
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "、".join(part for part in (_to_str(item) for item in value) if part)
    return ""


def _to_str_list(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    items = value if isinstance(value, list) else [value]
    return [text for text in (_to_str(item) for item in items) if text]


def _to_list(value: Any) -> list[Any]:
    if value is None or value == "":
        return []
    return value if isinstance(value, list) else [value]


def _to_skill_list(value: Any) -> list[Any]:
    return [{"name": item} if isinstance(item, str) else item for item in _to_list(value)]


def _to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    text = str(value).strip().lower().replace("k", "").replace("薪", "")
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


LooseStr = Annotated[str, BeforeValidator(_to_str)]
LooseStrList = Annotated[list[str], BeforeValidator(_to_str_list)]
LooseInt = Annotated[int | None, BeforeValidator(_to_int)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Basics(_Model):
    name: LooseStr = ""
    sex: LooseStr = ""
    birthday: LooseStr = ""
    city: LooseStr = ""
    phone: LooseStr = ""
    email: LooseStr = ""
    wechat: LooseStr = ""


class EducationItem(_Model):
    school: LooseStr = ""
    major: LooseStr = ""
    degree: LooseStr = ""
    gpa: LooseStr = ""
    start: LooseStr = ""
    end: LooseStr = ""


class WorkItem(_Model):
    company: LooseStr = ""
    title: LooseStr = ""
    start: LooseStr = ""
    end: LooseStr = ""
    description: LooseStr = ""
    highlights: LooseStrList = Field(default_factory=list)


class ProjectItem(_Model):
    name: LooseStr = ""
    role: LooseStr = ""
    start: LooseStr = ""
    end: LooseStr = ""
    description: LooseStr = ""
    tech: LooseStrList = Field(default_factory=list)


class SkillItem(_Model):
    name: LooseStr = ""
    level: LooseStr = ""


class JobWant(_Model):
    jobtitle: LooseStr = ""
    city: LooseStr = ""
    salaryLow: LooseInt = None
    salaryHigh: LooseInt = None
    salaryMonths: LooseInt = None
    workType: LooseStr = ""


class ResumeData(_Model):
    basics: Basics = Field(default_factory=Basics)
    selfAssess: LooseStr = ""
    education: Annotated[list[EducationItem], BeforeValidator(_to_list)] = Field(default_factory=list)
    work: Annotated[list[WorkItem], BeforeValidator(_to_list)] = Field(default_factory=list)
    projects: Annotated[list[ProjectItem], BeforeValidator(_to_list)] = Field(default_factory=list)
    skills: Annotated[list[SkillItem], BeforeValidator(_to_skill_list)] = Field(default_factory=list)
    jobWant: JobWant = Field(default_factory=JobWant)


def missing_fields(resume: ResumeData) -> list[str]:
    missing: list[str] = []
    if not resume.basics.name:
        missing.append("basics.name")
    if not resume.basics.phone and not resume.basics.email:
        missing.append("basics.contact")
    if not resume.selfAssess:
        missing.append("selfAssess")
    if not resume.education:
        missing.append("education")
    if not resume.work and not resume.projects:
        missing.append("experience")
    if not resume.skills:
        missing.append("skills")
    if not resume.jobWant.jobtitle:
        missing.append("jobWant.jobtitle")
    return missing
