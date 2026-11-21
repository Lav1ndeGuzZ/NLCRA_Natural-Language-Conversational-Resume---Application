from __future__ import annotations

import json
from typing import Any

from app.models.resume import ResumeData
from app.services.deepseek import DeepSeekClient

EXTRACT_SYSTEM_PROMPT = """你是简历信息抽取器。输入是求职者与助手的对话记录，你要把其中关于求职者本人的事实抽成结构化 JSON。

输出必须是一个 JSON 对象，字段固定如下（缺失的信息留空字符串或空数组，不要编造）：
{
  "basics": {"name": "", "sex": "", "birthday": "", "city": "", "phone": "", "email": "", "wechat": ""},
  "selfAssess": "",
  "education": [{"school": "", "major": "", "degree": "", "gpa": "", "start": "", "end": ""}],
  "work": [{"company": "", "title": "", "start": "", "end": "", "description": "", "highlights": ["..."]}],
  "projects": [{"name": "", "role": "", "start": "", "end": "", "description": "", "tech": ["..."]}],
  "skills": [{"name": "", "level": ""}],
  "jobWant": {"jobtitle": "", "city": "", "salaryLow": null, "salaryHigh": null, "salaryMonths": null, "workType": ""}
}

规则：
1. 只使用对话中求职者明确说过的信息。助手的话不算事实来源。
2. 不确定的字段留空，不要猜测、不要补写、不要美化。
3. work.highlights 优先抽取带结果的表述（数字、比例、时长、规模），一句一条。
4. 时间统一为 YYYY-MM 或 YYYY，进行中写「至今」。
5. 成绩写进 gpa：GPA、排名、平均分都放这里，例如「3.8/4.0」「专业前 10%」。
6. salaryLow / salaryHigh / salaryMonths 是整数，单位 K，例如「25-35K·14 薪」→ 25、35、14。
7. 只输出 JSON，不要 Markdown、不要解释。"""


class ExtractionError(Exception):
    pass


def _loads(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ExtractionError("模型未返回 JSON。")
    try:
        data = json.loads(text[start : end + 1])
    except ValueError as exc:
        raise ExtractionError("模型返回的 JSON 无法解析。") from exc
    if not isinstance(data, dict):
        raise ExtractionError("模型返回的 JSON 结构不是对象。")
    return data


async def extract_resume(messages: list[dict[str, str]], max_history: int = 16) -> ResumeData:
    history = [
        {"role": item["role"], "content": item["content"]}
        for item in messages[-max_history:]
        if item.get("content")
    ]
    if not history:
        raise ExtractionError("对话为空，无法抽取简历信息。")

    payload = [{"role": "system", "content": EXTRACT_SYSTEM_PROMPT}, *history]
    raw = await DeepSeekClient().chat(payload, temperature=0.1, json_mode=True)
    return ResumeData.model_validate(_loads(raw))
