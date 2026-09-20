from __future__ import annotations

from pydantic import BaseModel, Field

from config import OPENAI_API_KEY, OPENAI_MODEL


class BusinessAnalysis(BaseModel):
    services: list[str] = Field(default_factory=list)
    summary: str = ""
    outreach_message: str = ""


def enrich_business(name: str, category: str, rating) -> BusinessAnalysis | None:
    if not OPENAI_API_KEY:
        return None
    try:
        from langchain_core.prompts import ChatPromptTemplate
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model=OPENAI_MODEL, api_key=OPENAI_API_KEY, temperature=0.7)
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are a B2B copywriter for a web-design agency pitching local businesses that have no website. "
                    "Return services (short phrases), one specific summary sentence, and a short cold outreach message. "
                    "No generic greetings, no hype, no URLs.",
                ),
                (
                    "human",
                    "Business Name: {name}\nCategory: {category}\nRating: {rating}",
                ),
            ]
        )
        chain = prompt | llm.with_structured_output(BusinessAnalysis)
        return chain.invoke({"name": name, "category": category, "rating": rating})
    except Exception:
        return BusinessAnalysis(
            services=["Website"],
            summary=f"{name} is a local {category} without a website.",
            outreach_message=f"I put together a sample site for {name}. Want me to send the preview?",
        )
