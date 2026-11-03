from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import demo, health, liepin, llm, resume
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="NLCRA 求职工作台 API",
    version=settings.version,
    description="无登录、单用户、只接入猎聘的求职工具后端。",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "x-user-token", "x-access-code"],
)

app.include_router(health.router)
app.include_router(demo.router)
app.include_router(liepin.router)
app.include_router(llm.router)
app.include_router(resume.router)


@app.get("/")
async def root() -> dict:
    return {
        "name": "NLCRA 求职工作台",
        "docs": "/docs",
        "health": "/api/health",
    }
