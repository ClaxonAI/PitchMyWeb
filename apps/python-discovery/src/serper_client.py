from __future__ import annotations

import re
from typing import Any

import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from config import REQUEST_TIMEOUT_SECONDS, SERPER_API_KEY

_HEADERS = {"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"}


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _post(url: str, payload: Any) -> Any:
    resp = requests.post(url, headers=_HEADERS, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
    if resp.status_code in (401, 403):
        raise RuntimeError("Serper rejected the API key (check SERPER_API_KEY)")
    resp.raise_for_status()
    return resp.json()


def search_maps_page(query: str, page: int = 1, ll: str | None = None) -> dict:
    body: dict[str, Any] = {"q": query.strip().strip('"'), "gl": "in", "hl": "en"}
    if page > 1:
        body["page"] = page
    if ll:
        body["ll"] = ll
    return _post("https://google.serper.dev/maps", body)


def search_social_profiles(business_name: str) -> dict:
    return _post("https://google.serper.dev/search", {"q": business_name, "num": 10, "gl": "in"})


_SOCIAL_PATTERNS = {
    "instagram": re.compile(r"https?://(www\.)?instagram\.com/(?!reel|p/)[^\"& ]+", re.I),
    "facebook": re.compile(r"https?://(www\.)?facebook\.com/(?!share|sharer|videos)[^\"& ]+", re.I),
}


def parse_social_results(search_json: dict) -> dict[str, str | None]:
    text = str(search_json)
    parsed: dict[str, str | None] = {}
    for key, pattern in _SOCIAL_PATTERNS.items():
        match = pattern.search(text)
        parsed[key] = match.group(0) if match else None
    return parsed
