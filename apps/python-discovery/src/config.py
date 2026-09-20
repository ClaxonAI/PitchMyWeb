import os
from pathlib import Path

from dotenv import load_dotenv

_here = Path(__file__).resolve().parent
_api_env = _here.parents[1] / "api" / ".env"
load_dotenv(_here.parent / ".env")
load_dotenv(_api_env)


def _get(name: str, default: str | None = None, required: bool = False) -> str:
    value = os.getenv(name, default)
    if required and not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value or ""


REDIS_URL = _get("REDIS_URL", "redis://127.0.0.1:6381")
QUEUE_PREFIX = _get("WA_QUEUE_PREFIX", "bull")
QUEUE_NAME = "business-discovery"
API_INTERNAL_URL = _get("API_INTERNAL_URL", "http://localhost:4000").rstrip("/")
INTERNAL_JOBS_SECRET = _get("INTERNAL_JOBS_SECRET", required=True)
SERPER_API_KEY = _get("SERPER_API_KEY", required=True)
OPENAI_API_KEY = _get("OPENAI_API_KEY")
OPENAI_MODEL = _get("OPENAI_MODEL", "gpt-4o-mini")
REQUEST_TIMEOUT_SECONDS = float(_get("DISCOVERY_REQUEST_TIMEOUT_MS", "30000")) / 1000
REQUEST_DELAY_SECONDS = float(_get("REQUEST_DELAY_SECONDS", "0.4"))
MAX_MAPS_PAGES = int(_get("MAX_MAPS_PAGES", "6"))
