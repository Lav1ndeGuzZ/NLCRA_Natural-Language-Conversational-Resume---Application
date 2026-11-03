from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class LiepinError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class LiepinClient:
    """Thin server-side client for Liepin's Agent REST API.

    The user token is passed per request and never stored by this class.
    """

    def __init__(self, token: str) -> None:
        self._token = token
        self._settings = get_settings()

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._settings.liepin_base_url.rstrip("/"),
            timeout=self._settings.liepin_timeout_seconds,
            headers={
                "Accept": "application/json",
                "x-user-token": self._token,
            },
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
    ) -> Any:
        try:
            async with self._client() as client:
                response = await client.request(method, path, json=json)
        except httpx.TimeoutException as exc:
            raise LiepinError(504, "猎聘接口超时，请稍后重试。") from exc
        except httpx.HTTPError as exc:
            logger.warning("Liepin request failed: %s %s (%s)", method, path, type(exc).__name__)
            raise LiepinError(502, "无法连接猎聘接口，请检查网络。") from exc

        if response.status_code in (401, 403):
            raise LiepinError(401, "猎聘 token 无效或已过期，请重新生成。")
        if response.status_code >= 400:
            detail = _extract_error(response)
            raise LiepinError(response.status_code, detail or f"猎聘接口返回 {response.status_code}")

        try:
            return response.json()
        except ValueError:
            return {"raw": response.text}

    async def get_resume(self) -> Any:
        return await self._request("GET", "/mcp/get-resume")

    async def search_jobs(self, payload: dict[str, Any]) -> Any:
        return await self._request("POST", "/mcp/search-job", json=payload)

    async def apply_job(self, payload: dict[str, Any]) -> Any:
        return await self._request("POST", "/mcp/apply-job", json=payload)


def _extract_error(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return ""
    if isinstance(data, dict):
        for key in ("message", "msg", "detail", "error"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""
