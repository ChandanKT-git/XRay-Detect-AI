"""Vision provider integration for medical image analysis.

Supports two providers via VISION_PROVIDER env var:
- "gemini"   : Google Gemini's OpenAI-compatible /chat/completions endpoint (default)
- "groq"     : Groq's OpenAI-compatible /chat/completions endpoint
"""
import asyncio
import json
import logging
import os
import re
import uuid
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

VISION_PROVIDER = os.environ.get("VISION_PROVIDER", "gemini").lower().strip()
VISION_MODEL = os.environ.get("VISION_MODEL", "").strip()

PROVIDER_CONFIG = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "api_key_var": "GROQ_API_KEY",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "default_model": "gemini-2.5-flash",
        "api_key_var": "GEMINI_API_KEY",
    },
}

SYSTEM_PROMPT = """You are MedAI, an experienced board-certified radiologist AI assistant supporting medical doctors during preliminary review of medical imaging.

You will be given a medical image (X-ray, MRI, or CT scan) and metadata. Provide a structured, clinically-informed preliminary observation.

CRITICAL: This is a decision support tool. Your output is reviewed by a licensed physician and is NOT a final diagnosis.

You MUST respond with ONLY a valid JSON object (no markdown fences, no commentary), in this exact schema:

{
  "primary_finding": "<short disease/condition name, e.g. 'Pneumonia (right lower lobe)' or 'No acute findings'>",
  "confidence": <number 0-100, your confidence in primary_finding>,
  "severity": "<one of: normal | low | moderate | high | critical>",
  "description": "<2-4 sentence clinical description of what is observed>",
  "regions": [
    {
      "x": <0.0-1.0 left edge of bounding box as fraction of image width>,
      "y": <0.0-1.0 top edge as fraction of image height>,
      "width": <0.0-1.0 width as fraction>,
      "height": <0.0-1.0 height as fraction>,
      "label": "<short label, e.g. 'Consolidation' or 'Suspicious mass'>",
      "confidence": <number 0-100>
    }
  ],
  "differential_diagnoses": ["<alt diagnosis 1>", "<alt diagnosis 2>"],
  "recommendations": ["<actionable next step 1>", "<actionable next step 2>"],
  "raw_observations": "<paragraph of detailed visual observations from the image>"
}

Rules:
- If the image is normal, set severity="normal", confidence >= 80, regions=[].
- For findings, ALWAYS include at least one bounding box around the most abnormal region.
- Bounding boxes use NORMALIZED coordinates 0.0-1.0 (top-left origin).
- Be conservative with confidence; never claim 100%.
- Keep `description` UNDER 60 words. Keep `raw_observations` UNDER 200 words. Each region label UNDER 12 words.
- Output at most 5 regions, 5 differential diagnoses, and 5 recommendations.
- If the image is not a medical scan or unreadable, set primary_finding="Unreadable / Non-medical image", confidence=0, severity="normal", regions=[].
- Output ONLY the JSON object."""


class VisionError(Exception):
    pass


# Back-compat alias for previous callers
GroqVisionError = VisionError


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    return text


def _cleanup_json(text: str) -> str:
    """Repair common LLM JSON glitches (trailing commas, smart quotes)."""
    text = text.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    # Strip trailing commas before } or ]
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return text


def _extract_json(text: str) -> dict:
    text = _strip_code_fences(text)
    for candidate in (text, _cleanup_json(text)):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        slice_ = text[start : end + 1]
        for candidate in (slice_, _cleanup_json(slice_)):
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
        raise VisionError(f"Failed to parse JSON from model output (last attempt): {slice_[:200]!r}…")
    raise VisionError("No JSON object found in model output")


def _coerce_result(data: dict) -> dict:
    def num(v, default=0.0, lo=0.0, hi=1.0):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return default
        return max(lo, min(hi, f))

    def pct(v, default=0.0):
        return num(v, default=default, lo=0.0, hi=100.0)

    severity = str(data.get("severity", "normal")).lower().strip()
    if severity not in {"normal", "low", "moderate", "high", "critical"}:
        severity = "moderate"

    regions_raw = data.get("regions") or []
    regions = []
    if isinstance(regions_raw, list):
        for r in regions_raw:
            if not isinstance(r, dict):
                continue
            regions.append(
                {
                    "x": num(r.get("x"), 0.0),
                    "y": num(r.get("y"), 0.0),
                    "width": num(r.get("width"), 0.1),
                    "height": num(r.get("height"), 0.1),
                    "label": str(r.get("label", "Region of interest"))[:120],
                    "confidence": pct(r.get("confidence"), default=70.0),
                }
            )

    def to_str_list(v):
        if isinstance(v, list):
            return [str(x)[:300] for x in v if x][:8]
        return []

    return {
        "primary_finding": str(data.get("primary_finding", "Inconclusive"))[:200],
        "confidence": pct(data.get("confidence"), default=0.0),
        "severity": severity,
        "description": str(data.get("description", ""))[:2000],
        "regions": regions,
        "differential_diagnoses": to_str_list(data.get("differential_diagnoses")),
        "recommendations": to_str_list(data.get("recommendations")),
        "raw_observations": str(data.get("raw_observations", ""))[:4000] or None,
    }


def _resolve_provider() -> tuple[str, str, str]:
    """Return (base_url, model, api_key) for the configured provider."""
    cfg = PROVIDER_CONFIG.get(VISION_PROVIDER)
    if not cfg:
        raise VisionError(f"Unknown VISION_PROVIDER: {VISION_PROVIDER}")
    api_key = os.environ.get(cfg["api_key_var"], "")
    if not api_key:
        raise VisionError(f"{cfg['api_key_var']} is not configured")
    model = VISION_MODEL or cfg["default_model"]
    return cfg["base_url"], model, api_key


async def analyze_medical_image(
    image_base64: str,
    image_mime: str,
    scan_type: str,
    body_part: Optional[str] = None,
    patient_age: Optional[int] = None,
    patient_gender: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """Send the medical image to the configured vision model and return a structured result."""
    if image_base64.startswith("data:"):
        try:
            image_base64 = image_base64.split(",", 1)[1]
        except IndexError:
            pass

    if image_mime not in {"image/jpeg", "image/png", "image/webp"}:
        image_mime = "image/jpeg"

    metadata_lines = [
        f"Modality: {scan_type.upper()}",
        f"Body Part: {body_part or 'unspecified'}",
        f"Patient Age: {patient_age if patient_age is not None else 'unspecified'}",
        f"Patient Gender: {patient_gender or 'unspecified'}",
    ]
    if notes:
        metadata_lines.append(f"Clinician Notes: {notes}")

    user_text = (
        "Please analyze this medical image and return ONLY the JSON object as specified.\n\n"
        + "\n".join(metadata_lines)
    )

    content = await _openai_compat_call(user_text, image_base64, image_mime)

    if not content:
        raise VisionError(f"Empty content from {VISION_PROVIDER}")

    parsed = _extract_json(content)
    return _coerce_result(parsed)


async def _openai_compat_call(user_text: str, image_base64: str, image_mime: str) -> str:
    """Call Groq or Gemini's OpenAI-compatible /chat/completions endpoint."""
    base_url, model, api_key = _resolve_provider()

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{image_mime};base64,{image_base64}"},
                    },
                ],
            },
        ],
        "temperature": 0.2,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        last_error_text = ""
        for attempt in range(2):
            try:
                resp = await client.post(
                    f"{base_url}/chat/completions", json=payload, headers=headers
                )
            except httpx.HTTPError as e:
                raise VisionError(f"Network error contacting {VISION_PROVIDER}: {e}")
            if resp.status_code == 200:
                break
            last_error_text = resp.text[:500]
            logger.warning(
                "%s API attempt %d returned %s: %s",
                VISION_PROVIDER, attempt + 1, resp.status_code, last_error_text[:200],
            )
            if resp.status_code < 500 or attempt == 1:
                raise VisionError(f"{VISION_PROVIDER} API returned {resp.status_code}: {last_error_text[:300]}")
            await asyncio.sleep(1.5)
        else:
            raise VisionError(f"{VISION_PROVIDER} API failed after retries: {last_error_text[:300]}")

    body = resp.json()
    try:
        return body["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise VisionError(f"Unexpected {VISION_PROVIDER} response shape: {e}")
