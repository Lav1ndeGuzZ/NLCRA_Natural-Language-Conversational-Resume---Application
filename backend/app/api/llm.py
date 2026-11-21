from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.demo_data import DEMO_CHAT_REPLY
from app.models.schemas import ChatRequest, ChatResponse, SaveChatRequest
from app.security import require_access_code, require_session_id
from app.services.deepseek import DeepSeekClient, DeepSeekError, DeepSeekNotConfigured
from app.services.store import load_chat, save_chat

router = APIRouter(
    prefix="/api/llm",
    tags=["llm"],
    dependencies=[Depends(require_access_code)],
)

SYSTEM_PROMPT = """你是 NLCRA 求职工作台的项目专属求职助手，服务对象是准备实习、校招或社招的学生。
你的核心任务不是闲聊，而是按顺序引导用户完成一份可投递的简历，覆盖五类信息：
1. 做过的项目/课题；
2. 就读学校、专业、成绩（GPA/排名/均分）；
3. 工作/实习经历（企业、岗位、时间、职责、结果）；
4. 技能（工具、语言、证书、熟练度）；
5. 项目经验（背景、你的动作、方法、可量化结果）；
6. 求职意向（目标岗位、城市、薪资、工作类型）。

规则：
1. 每次只问一个最关键的问题；先确认用户刚说的关键事实，再追问时间、角色、动作、结果。
2. 只使用用户明确提供的信息，不编造公司、学校、时间、数字；不确定就问。
3. 先分析再填充：信息不足时不要声称已经生成简历，要明确告诉用户还缺哪几类信息。
4. 用户一次说了很多时，先归纳成结构化要点，再问下一个缺口。
5. 输出中文、简洁、分点、可复制；涉及投递、修改简历等外部动作时，先让用户确认。
"""


@router.get("/history")
async def read_history(session_id: str = Depends(require_session_id)) -> dict:
    messages, updated_at = load_chat(session_id)
    return {"ok": True, "data": messages, "updated_at": updated_at}


@router.put("/history")
async def write_history(
    body: SaveChatRequest,
    session_id: str = Depends(require_session_id),
) -> dict:
    updated_at = save_chat(session_id, [message.model_dump() for message in body.messages])
    return {"ok": True, "updated_at": updated_at}


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    settings = get_settings()
    messages = [message.model_dump() for message in body.messages]
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    if not settings.deepseek_configured:
        if settings.demo_mode:
            return ChatResponse(content=DEMO_CHAT_REPLY, model="demo", demo=True)
        raise HTTPException(status_code=503, detail="服务端未配置 DEEPSEEK_API_KEY。")

    try:
        content = await DeepSeekClient().chat(messages, temperature=body.temperature)
        return ChatResponse(content=content, model=settings.deepseek_model)
    except DeepSeekNotConfigured as exc:
        raise HTTPException(status_code=503, detail="服务端未配置 DEEPSEEK_API_KEY。") from exc
    except DeepSeekError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _demo_stream() -> AsyncIterator[str]:
    yield _sse({"model": "demo", "demo": True})
    for index in range(0, len(DEMO_CHAT_REPLY), 8):
        yield _sse({"delta": DEMO_CHAT_REPLY[index : index + 8]})
        await asyncio.sleep(0.04)
    yield _sse({"done": True, "model": "demo", "demo": True})


@router.post("/chat/stream")
async def chat_stream(body: ChatRequest) -> StreamingResponse:
    """SSE 版本对话接口：逐字返回，首字延迟从数秒降到数百毫秒。

    前端按 ``data: {"delta": "..."}`` 累加，收到 ``{"done": true}`` 结束；
    出错时不改 HTTP 状态码（响应头已发出），而是推一条 ``{"error": "..."}``。
    """
    settings = get_settings()
    messages = [message.model_dump() for message in body.messages]
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    if not settings.deepseek_configured:
        if settings.demo_mode:
            return StreamingResponse(
                _demo_stream(), media_type="text/event-stream", headers=SSE_HEADERS
            )
        raise HTTPException(status_code=503, detail="服务端未配置 DEEPSEEK_API_KEY。")

    async def event_stream() -> AsyncIterator[str]:
        yield _sse({"model": settings.deepseek_model, "demo": False})
        try:
            async for delta in DeepSeekClient().stream(messages, temperature=body.temperature):
                yield _sse({"delta": delta})
        except DeepSeekNotConfigured:
            yield _sse({"error": "服务端未配置 DEEPSEEK_API_KEY。"})
            return
        except DeepSeekError as exc:
            yield _sse({"error": str(exc)})
            return
        except asyncio.CancelledError:
            # 用户关闭页面或切换页面：停止转发，避免继续消耗额度。
            raise
        yield _sse({"done": True, "model": settings.deepseek_model, "demo": False})

    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers=SSE_HEADERS
    )
