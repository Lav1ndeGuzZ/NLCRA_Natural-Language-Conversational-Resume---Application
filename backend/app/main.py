from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import applications, demo, email, health, liepin, llm, match, official, reminders, resume
from app.config import get_settings
from app.db import init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="NLCRA 求职工作台 API",
    version=settings.version,
    description="无登录、单用户的求职工具后端；支持猎聘、QQ 邮箱与官网渠道。",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "x-user-token", "x-access-code", "x-session-id", "x-qq-email", "x-qq-auth-code"],
)

app.include_router(health.router)
app.include_router(demo.router)
app.include_router(liepin.router)
app.include_router(llm.router)
app.include_router(match.router)
app.include_router(applications.router)
app.include_router(resume.router)
app.include_router(email.router)
app.include_router(official.router)
app.include_router(reminders.router)


@app.get("/")
async def root() -> dict:
    return {
        "name": "NLCRA 求职工作台",
        "docs": "/docs",
        "health": "/api/health",
    }
