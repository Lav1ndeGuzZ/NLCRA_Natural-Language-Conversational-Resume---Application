from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class DeepSeekNotConfigured(Exception):
    pass


class DeepSeekError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class DeepSeekClient:
    def __init__(self) -> None:
        self._settings = get_settings()

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        json_mode: bool = False,
    ) -> str:
        if not self._settings.deepseek_configured:
            raise DeepSeekNotConfigured()

        payload: dict[str, Any] = {
            "model": self._settings.deepseek_model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        headers = {
            "Authorization": f"Bearer {self._settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self._settings.deepseek_base_url.rstrip('/')}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=self._settings.deepseek_timeout_seconds) as client:
                response = await client.post(url, json=payload, headers=headers)
        except httpx.TimeoutException as exc:
            raise DeepSeekError("DeepSeek 请求超时，请稍后重试。", 504) from exc
        except httpx.HTTPError as exc:
            logger.warning("DeepSeek request failed: %s", type(exc).__name__)
            raise DeepSeekError("无法连接 DeepSeek，请检查网络或 Key。") from exc

        if response.status_code >= 400:
            logger.warning("DeepSeek error status=%s", response.status_code)
            raise DeepSeekError(f"DeepSeek 返回 {response.status_code}，请检查 Key 或额度。")

        try:
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise DeepSeekError("DeepSeek 响应格式异常。") from exc

    async def stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
    ) -> AsyncIterator[str]:
        """逐块产出 DeepSeek 的增量文本，用于 SSE 转发。"""
        if not self._settings.deepseek_configured:
            raise DeepSeekNotConfigured()

        payload: dict[str, Any] = {
            "model": self._settings.deepseek_model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self._settings.deepseek_api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        url = f"{self._settings.deepseek_base_url.rstrip('/')}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=self._settings.deepseek_timeout_seconds) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code >= 400:
                        logger.warning("DeepSeek stream error status=%s", response.status_code)
                        raise DeepSeekError(
                            f"DeepSeek 返回 {response.status_code}，请检查 Key 或额度。"
                        )
                    async for raw_line in response.aiter_lines():
                        line = raw_line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            delta = chunk["choices"][0]["delta"].get("content")
                        except (ValueError, KeyError, IndexError, TypeError):
                            continue
                        if delta:
                            yield delta
        except httpx.TimeoutException as exc:
            raise DeepSeekError("DeepSeek 请求超时，请稍后重试。", 504) from exc
        except DeepSeekError:
            raise
        except httpx.HTTPError as exc:
            logger.warning("DeepSeek stream failed: %s", type(exc).__name__)
            raise DeepSeekError("无法连接 DeepSeek，请检查网络或 Key。") from exc
