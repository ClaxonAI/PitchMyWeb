"""BullMQ consumer for QUEUE_DISCOVERY (`business-discovery`).

Do not run apps/discovery-worker against the same Redis prefix at the same
time — both consume this queue.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from api_client import process_execution
from config import QUEUE_NAME, QUEUE_PREFIX, REDIS_URL

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("python-discovery")


async def handle_job(job, token=None):
    execution_id = (job.data or {}).get("executionId")
    if not execution_id:
        log.warning("job %s missing executionId", getattr(job, "id", "?"))
        return
    log.info("processing execution %s", execution_id)
    await asyncio.to_thread(process_execution, execution_id)


async def main() -> None:
    from bullmq import Worker

    log.info("python discovery worker listening on %s (prefix=%s)", QUEUE_NAME, QUEUE_PREFIX)
    worker = Worker(
        QUEUE_NAME,
        handle_job,
        {
            "connection": REDIS_URL,
            "prefix": QUEUE_PREFIX,
            "concurrency": 1,
            "lockDuration": 600_000,
        },
    )
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
