from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.demo_data import DEMO_CHAT_REPLY
from app.models.schemas import ChatRequest, ChatResponse
from app.security import require_access_code
from app.services.deepseek import DeepSeekClient, DeepSeekError, DeepSeekNotConfigured

router = APIRouter(
    prefix="/api/llm",
    tags=["llm"],
    dependencies=[Depends(require_access_code)],
)

SYSTEM_PROMPT = """你是 NLCRA 求职工作台的助手。
你的任务是帮助用户梳理真实经历、生成简历、解释岗位匹配、给出投递建议。
规则：
1. 只使用用户明确提供的信息，不编造公司、学校、时间、数字。
2. 信息不足时，先问一个最关键的问题，不要一次问很多。
3. 输出尽量结构化：分点、短句、可复制。
4. 涉及投递、修改简历等外部动作时，提醒用户确认后再执行。
5. 用中文回答，语气专业、简洁。
"""


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
