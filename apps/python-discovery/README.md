# PitchMyWeb Python discovery worker

Google Maps lead scrape (Serper) + optional OpenAI enrichment. Consumes the
same `business-discovery` BullMQ queue as `apps/discovery-worker` — run **one**
of them, not both.

## Setup

```bash
python -m venv apps/python-discovery/.venv
apps/python-discovery/.venv/Scripts/activate   # Windows
pip install -r apps/python-discovery/requirements.txt
```

Uses `apps/api/.env` (`SERPER_API_KEY`, `INTERNAL_JOBS_SECRET`, `REDIS_URL`,
`API_INTERNAL_URL`, optional `OPENAI_API_KEY`).

Set `LEAD_PROVIDER=python` in `apps/api/.env`.

```bash
npm run dev:python-discovery
```

Scraping starts only after a paid Razorpay order is claimed, from **Discover**
in the dashboard (`POST /api/campaigns/:id/run`).
