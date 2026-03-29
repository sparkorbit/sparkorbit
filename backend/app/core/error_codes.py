from __future__ import annotations

from typing import TypedDict


class LlmErrorDefinition(TypedDict):
    code: str
    title: str
    summary: str
    user_action: str


LLM_UNKNOWN_FAILURE = "SPK-LLM-000"
LLM_MODEL_NOT_READY = "SPK-LLM-001"
LLM_BRIEFING_GENERATOR_INIT_FAILED = "SPK-LLM-002"
LLM_BRIEFING_GENERATION_FAILED = "SPK-LLM-003"
LLM_OFFLINE_LABELING_FAILED = "SPK-LLM-004"


LLM_ERROR_REGISTRY: dict[str, LlmErrorDefinition] = {
    LLM_UNKNOWN_FAILURE: {
        "code": LLM_UNKNOWN_FAILURE,
        "title": "Unknown LLM failure",
        "summary": "SparkOrbit could not classify the LLM failure more precisely.",
        "user_action": "Share the error code and the recorded session_llm_errors.ndjson entry.",
    },
    LLM_MODEL_NOT_READY: {
        "code": LLM_MODEL_NOT_READY,
        "title": "Local model not ready",
        "summary": "The configured local model was not available when enrichment started.",
        "user_action": "Confirm the local model is installed and Ollama is healthy, then reload.",
    },
    LLM_BRIEFING_GENERATOR_INIT_FAILED: {
        "code": LLM_BRIEFING_GENERATOR_INIT_FAILED,
        "title": "Briefing generator initialization failed",
        "summary": "SparkOrbit could not initialize the LLM briefing generator.",
        "user_action": "Share the code and the recorded error payload so the generator setup can be inspected.",
    },
    LLM_BRIEFING_GENERATION_FAILED: {
        "code": LLM_BRIEFING_GENERATION_FAILED,
        "title": "Briefing generation failed",
        "summary": "The briefing request reached the generator but did not complete successfully.",
        "user_action": "Share the code and the recorded error payload from the failing session.",
    },
    LLM_OFFLINE_LABELING_FAILED: {
        "code": LLM_OFFLINE_LABELING_FAILED,
        "title": "Offline paper labeling failed",
        "summary": "Paper topic labeling failed, so the dashboard fell back to raw source coverage.",
        "user_action": "Share the code and the session_llm_errors.ndjson entry for the failed run.",
    },
}


def get_llm_error_definition(code: str | None) -> LlmErrorDefinition:
    normalized = str(code or "").strip() or LLM_UNKNOWN_FAILURE
    if normalized in LLM_ERROR_REGISTRY:
        return LLM_ERROR_REGISTRY[normalized]

    fallback = dict(LLM_ERROR_REGISTRY[LLM_UNKNOWN_FAILURE])
    fallback["code"] = normalized
    return fallback
