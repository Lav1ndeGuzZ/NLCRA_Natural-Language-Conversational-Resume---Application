from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "NLCRA"
    environment: str = "development"
    version: str = "0.1.0"

    # Shared access gate for deployments. Empty means disabled (local dev).
    app_access_code: str = ""

    # Liepin Agent API
    liepin_base_url: str = "https://open-agent.liepin.com"
    liepin_timeout_seconds: float = 30.0

    # DeepSeek (OpenAI-compatible)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_timeout_seconds: float = 60.0

    # Demo mode keeps the UI usable without a Liepin token / DeepSeek key.
    demo_mode: bool = True

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def deepseek_configured(self) -> bool:
        return bool(self.deepseek_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
