from __future__ import annotations

RESUME_TEMPLATES = [
    {
        "id": "classic",
        "name": "经典单栏",
        "description": "黑白稳重，适合国企、传统行业与通用投递",
        "accent": "#0F172A",
    },
    {
        "id": "modern",
        "name": "现代蓝线",
        "description": "蓝色章节标题，适合互联网、产品与运营岗位",
        "accent": "#2563EB",
    },
    {
        "id": "compact",
        "name": "紧凑一页",
        "description": "更小字号与间距，经历较多时优先控制在一页",
        "accent": "#0F766E",
    },
    {
        "id": "executive",
        "name": "稳重深色",
        "description": "深色标题与留白，适合管理岗、咨询与金融",
        "accent": "#7C2D12",
    },
]

TEMPLATE_IDS = {item["id"] for item in RESUME_TEMPLATES}


def normalize_template(template_id: str | None) -> str:
    value = (template_id or "classic").strip()
    return value if value in TEMPLATE_IDS else "classic"


def template_meta(template_id: str | None) -> dict:
    normalized = normalize_template(template_id)
    return next(item for item in RESUME_TEMPLATES if item["id"] == normalized)
