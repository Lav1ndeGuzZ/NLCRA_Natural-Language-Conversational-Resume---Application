from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)
    temperature: float = Field(default=0.3, ge=0, le=2)


class ChatResponse(BaseModel):
    content: str
    model: str
    demo: bool = False


class JobSearchRequest(BaseModel):
    job_name: str | None = None
    address: str | None = None
    salary_floor: str | None = None
    salary_cap: str | None = None
    salary_kind: str | None = None
    work_experience: str | None = None
    edu_level: str | None = None
    comp_nature: str | None = None
    company_name: str | None = None
    page: int = Field(default=0, ge=0, le=50)


class ApplyRequest(BaseModel):
    job_id: int
    job_kind: Literal["1", "2"]


class ResumeExportRequest(BaseModel):
    resume: dict[str, Any]
    filename: str = "resume"


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    demo_mode: bool
    deepseek_configured: bool
    access_code_required: bool
    liepin_base_url: str


class DemoJob(BaseModel):
    job_id: int
    job_kind: Literal["1", "2"]
    title: str
    company: str
    city: str
    salary: str
    experience: str
    education: str
    tags: list[str]
    match_score: int
    source: str = "demo"
