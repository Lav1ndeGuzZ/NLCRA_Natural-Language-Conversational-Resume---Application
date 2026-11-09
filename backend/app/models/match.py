from __future__ import annotations

from typing import Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field
from typing import Annotated

from app.models.resume import _to_str, _to_str_list

LooseStr = Annotated[str, BeforeValidator(_to_str)]
LooseStrList = Annotated[list[str], BeforeValidator(_to_str_list)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class JobBrief(_Model):
    job_id: int | None = None
    title: LooseStr = ""
    company: LooseStr = ""
    city: LooseStr = ""
    salary: LooseStr = ""
    experience: LooseStr = ""
    education: LooseStr = ""
    tags: LooseStrList = Field(default_factory=list)
    description: LooseStr = ""


class MatchRequest(_Model):
    resume: dict[str, Any]
    jobs: list[JobBrief] = Field(min_length=1, max_length=10)


class JobMatch(_Model):
    index: int = 0
    score: int = 0
    matched: LooseStrList = Field(default_factory=list)
    missing: LooseStrList = Field(default_factory=list)
    suggestion: LooseStr = ""


class MatchResponse(_Model):
    results: list[JobMatch] = Field(default_factory=list)
    model: str = "rule"
    demo: bool = False


class _RawMatches(_Model):
    results: list[JobMatch] = Field(default_factory=list)
