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
    pages: int = Field(default=3, ge=1, le=5, description="合并页数，每页约 20 条")


class ApplyRequest(BaseModel):
    job_id: int
    job_kind: Literal["1", "2"]


class ResumeExportRequest(BaseModel):
    resume: dict[str, Any]
    filename: str = "resume"
    template_id: str = "classic"


class ResumeAnalyzeRequest(BaseModel):
    resume: dict[str, Any]
    target: str = ""


class EmailDraftRequest(BaseModel):
    resume: dict[str, Any]
    job: dict[str, Any]
    match: dict[str, Any] | None = None


class EmailSendRequest(BaseModel):
    to: str
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)
    resume: dict[str, Any]
    job: dict[str, Any] = Field(default_factory=dict)
    template_id: str = "classic"


class OfficialCrawlRequest(BaseModel):
    url: str
    company: str = ""
    keyword: str = ""
    max_jobs: int = Field(default=8, ge=1, le=12)


class OfficialDiscoverRequest(BaseModel):
    keyword: str = ""
    city: str = ""
    companies: list[str] = Field(default_factory=list, max_length=10)
    limit: int = Field(default=8, ge=1, le=12)


class ExtractRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=50)


class ExtractResponse(BaseModel):
    resume: dict[str, Any]
    missing: list[str] = Field(default_factory=list)
    model: str
    demo: bool = False


class SaveResumeRequest(BaseModel):
    resume: dict[str, Any]
    template_id: str = "classic"


class SaveChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(max_length=200)


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
