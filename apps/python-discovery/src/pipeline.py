from __future__ import annotations

import logging
import time
from typing import Any

from ai_chains import enrich_business
from config import MAX_MAPS_PAGES, OPENAI_MODEL, REQUEST_DELAY_SECONDS
from serper_client import parse_social_results, search_maps_page, search_social_profiles

log = logging.getLogger("python-discovery")


def _place_to_business(place: dict, query: dict[str, Any]) -> dict | None:
    if not place.get("title") or not place.get("phoneNumber") or place.get("website"):
        return None
    rating = place.get("rating")
    reviews = place.get("ratingCount")
    min_rating = query.get("minRating")
    min_reviews = query.get("minReviews")
    if min_rating is not None and (rating or 0) < min_rating:
        return None
    if min_reviews is not None and (reviews or 0) < min_reviews:
        return None
    return {
        "name": place["title"],
        "category": query["category"],
        "address": place.get("address"),
        "city": query["location"],
        "phone": place.get("phoneNumber"),
        "email": None,
        "website": None,
        "instagram": None,
        "facebook": None,
        "rating": rating,
        "reviewCount": reviews,
        "latitude": place.get("latitude"),
        "longitude": place.get("longitude"),
        "source": "python",
        "externalId": place.get("cid"),
        "insights": None,
    }


def search_businesses(query: dict[str, Any]) -> list[dict]:
    maps_query = f"{query['category']} in {query['location']}"
    lead_limit = int(query.get("leadLimit") or 20)
    pages = min(MAX_MAPS_PAGES, max(1, (lead_limit // 20) + 1))
    candidates: list[dict] = []
    ll = None
    for page in range(1, pages + 1):
        payload = search_maps_page(maps_query, page, ll)
        if page == 1:
            ll = payload.get("ll")
        places = payload.get("places") or []
        if not places:
            break
        for place in places:
            business = _place_to_business(place, query)
            if not business:
                continue
            candidates.append(business)
            if len(candidates) >= lead_limit:
                break
        if len(candidates) >= lead_limit:
            break

    enriched: list[dict] = []
    for i, business in enumerate(candidates):
        try:
            socials = parse_social_results(search_social_profiles(business["name"]))
            business["instagram"] = socials.get("instagram")
            business["facebook"] = socials.get("facebook")
        except Exception:
            log.exception("Social lookup failed for %s", business["name"])
        analysis = enrich_business(business["name"], business["category"], business.get("rating"))
        if analysis:
            business["insights"] = {
                "summary": analysis.summary,
                "services": analysis.services,
                "outreachMessage": analysis.outreach_message,
                "model": OPENAI_MODEL,
            }
        enriched.append(business)
        if i < len(candidates) - 1:
            time.sleep(REQUEST_DELAY_SECONDS)
    return enriched
