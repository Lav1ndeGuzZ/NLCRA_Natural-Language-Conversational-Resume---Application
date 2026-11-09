from fastapi import Header, HTTPException

from app.config import get_settings


async def require_access_code(
    x_access_code: str | None = Header(default=None),
) -> None:
    """Optional shared access gate for public deployments.

    Empty APP_ACCESS_CODE disables the gate (local development).
    This is intentionally not a user account system.
    """
    expected = get_settings().app_access_code.strip()
    if not expected:
        return
    if (x_access_code or "").strip() != expected:
        raise HTTPException(
            status_code=401,
            detail="访问码无效。请向部署者获取访问码。",
        )


async def require_liepin_token(
    x_user_token: str | None = Header(default=None),
) -> str:
    token = (x_user_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="缺少猎聘 token。请先到猎聘授权页生成并粘贴 token。",
        )
    return token


async def require_session_id(
    x_session_id: str | None = Header(default=None),
) -> str:
    """Anonymous single-user session key used to scope saved data.

    Not authentication: it only separates data between browsers.
    """
    session_id = (x_session_id or "").strip()
    if not session_id:
        return "local"
    return session_id[:64]
