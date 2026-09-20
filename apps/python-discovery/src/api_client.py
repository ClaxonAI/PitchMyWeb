from __future__ import annotations

import logging
import time

import requests

from config import API_INTERNAL_URL, INTERNAL_JOBS_SECRET
from pipeline import search_businesses

log = logging.getLogger("python-discovery")
_AUTH = {"Authorization": f"Bearer {INTERNAL_JOBS_SECRET}", "Content-Type": "application/json"}


def fetch_job_params(execution_id: str) -> dict | None:
    url = f"{API_INTERNAL_URL}/api/internal/pipeline/discovery-jobs/{execution_id}"
    resp = requests.get(url, headers=_AUTH, timeout=15)
    if resp.status_code in (404, 409):
        return None
    resp.raise_for_status()
    return resp.json()


def _post_results(body: dict) -> None:
    url = f"{API_INTERNAL_URL}/api/internal/pipeline/discovery-results"
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = requests.post(url, headers=_AUTH, json=body, timeout=30)
            if resp.ok:
                return
            last_error = RuntimeError(f"API responded {resp.status_code}")
            if resp.status_code < 500:
                break
        except requests.RequestException as error:
            last_error = error
        time.sleep(attempt)
    raise last_error or RuntimeError("Callback failed")


def process_execution(execution_id: str) -> str:
    params = fetch_job_params(execution_id)
    if not params:
        log.info("skip execution %s (not RUNNING)", execution_id)
        return "skipped"
    try:
        businesses = search_businesses(params)
        log.info("found %d businesses for %s", len(businesses), execution_id)
        _post_results({"executionId": execution_id, "businesses": businesses})
        return "completed"
    except Exception as error:
        log.exception("discovery failed for %s", execution_id)
        _post_results({"executionId": execution_id, "error": str(error)})
        return "failed"
