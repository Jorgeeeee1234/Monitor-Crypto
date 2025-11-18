from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

class Settings:
    """Configuración centralizada del microservicio."""

    def __init__(self) -> None:
        self.app_name: str = os.getenv("APP_NAME", "Microservicio Python – Monitor Crypto")
        self.app_version: str = os.getenv("APP_VERSION", "1.0.0")
        self.coingecko_api_base: str = os.getenv("COINGECKO_API_BASE", "https://api.coingecko.com/api/v3")
        try:
            self.external_timeout: int = int(os.getenv("EXTERNAL_TIMEOUT", "15"))
        except ValueError:
            self.external_timeout = 15
        self.database_url: str = os.getenv(
            "DATABASE_URL",
            "postgresql://monitor:monitorpass@postgres:5432/monitorcrypto",
        )
        self.database_echo: bool = os.getenv("DATABASE_ECHO", "false").lower() in {"1", "true", "yes", "on"}
        try:
            self.sync_interval_seconds: int = int(os.getenv("SYNC_INTERVAL_SECONDS", "600"))
        except ValueError:
            self.sync_interval_seconds = 600
        self.sync_enable_scheduler: bool = os.getenv("SYNC_ENABLE_SCHEDULER", "false").lower() in {"1", "true", "yes", "on"}
        try:
            self.sync_per_page: int = int(os.getenv("SYNC_PER_PAGE", "50"))
        except ValueError:
            self.sync_per_page = 150
        try:
            self.sync_pages: int = int(os.getenv("SYNC_PAGES", "1"))
        except ValueError:
            self.sync_pages = 1
        self.sync_vs_currency: str = os.getenv("SYNC_VS_CURRENCY", "usd").lower()
        try:
            self.data_freshness_minutes: int = int(os.getenv("DATA_FRESHNESS_MINUTES", "15"))
        except ValueError:
            self.data_freshness_minutes = 15

@lru_cache
def get_settings() -> Settings:
    """Devuelve una instancia cacheada de Settings."""
    return Settings()
