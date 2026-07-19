"""Resend email service for MedAI scan notifications.

Sends HTML emails when:
- AI analysis completes
- AI analysis errors
- A clinician signs off on a report

All sends run in a thread so they don't block the FastAPI event loop, and any
failure is logged but never raised — emails are best-effort.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend

logger = logging.getLogger("medai.email")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _enabled() -> bool:
    return bool(RESEND_API_KEY)


SEVERITY_COLORS = {
    "normal": "#10b981",
    "low": "#0ea5e9",
    "moderate": "#f59e0b",
    "high": "#f97316",
    "critical": "#ef4444",
}


def _scan_link(scan_id: str) -> str:
    if PUBLIC_APP_URL:
        return f"{PUBLIC_APP_URL}/scans/{scan_id}"
    return f"/scans/{scan_id}"


def _wrap(html_body: str, preview: str) -> str:
    """Wrap a body fragment in a basic email shell with inline styles."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MedAI</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
  <span style="display:none;opacity:0;max-height:0;overflow:hidden;">{preview}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:#2563eb;padding:22px 28px;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;opacity:0.8;">MedAI Diagnosis Suite</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;">{preview}</div>
        </td></tr>
        <tr><td style="padding:28px;">{html_body}</td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.5;">
          MedAI is a clinical decision-support tool. AI findings are not a medical diagnosis and require a clinician's review.
          You're receiving this because you uploaded or own this scan.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _result_summary_html(scan: dict) -> str:
    result = scan.get("final_result") or scan.get("result") or {}
    severity = (result.get("severity") or "").lower()
    color = SEVERITY_COLORS.get(severity, "#475569")
    finding = result.get("primary_finding") or "—"
    confidence = result.get("confidence")
    description = (result.get("description") or "")[:380]
    confidence_html = (
        f'<span style="margin-left:8px;font-size:13px;color:#64748b;">{round(confidence)}% confidence</span>'
        if confidence is not None
        else ""
    )
    severity_html = (
        f'<span style="display:inline-block;background:{color};color:#fff;font-size:11px;font-weight:700;'
        f'text-transform:uppercase;letter-spacing:0.1em;padding:3px 8px;border-radius:999px;">{severity or "—"}</span>'
    )
    return f"""
    <div style="margin-bottom:8px;">{severity_html}{confidence_html}</div>
    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">{finding}</div>
    <div style="font-size:14px;line-height:1.55;color:#334155;">{description}</div>
    """


def _button(label: str, url: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;'
        f'padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">{label}</a>'
    )


def _patient_block(scan: dict) -> str:
    rows = [
        ("Patient", scan.get("patient_name", "—")),
        (
            "Age / Gender",
            f"{scan.get('patient_age') if scan.get('patient_age') is not None else '—'} / "
            f"{scan.get('patient_gender') or '—'}",
        ),
        ("Modality", f"{(scan.get('scan_type') or '').upper()} · {scan.get('body_part') or '—'}"),
        ("Scan ID", scan.get("id", "—")[:8] + "…"),
    ]
    body = "".join(
        f'<tr><td style="color:#64748b;padding:4px 0;width:120px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;">{k}</td>'
        f'<td style="padding:4px 0;font-size:14px;color:#0f172a;">{v}</td></tr>'
        for k, v in rows
    )
    return f'<table cellpadding="0" cellspacing="0" style="margin-top:16px;">{body}</table>'


# ============ Public templates ============

def _build_completed(scan: dict, recipient_name: str) -> tuple[str, str]:
    subject = f"AI analysis ready · {scan.get('patient_name', 'Scan')}"
    html = _wrap(
        f"""
        <p style="margin:0 0 18px;font-size:15px;color:#334155;">
          Hi {recipient_name.split(' ')[0] if recipient_name else 'doctor'}, the AI has finished analysing
          this scan and a preliminary read is ready for your review and sign-off.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;">
          {_result_summary_html(scan)}
        </div>
        {_patient_block(scan)}
        <div style="margin-top:24px;">
          {_button('Review & sign off →', _scan_link(scan['id']))}
        </div>
        """,
        "AI analysis ready",
    )
    return subject, html


def _build_error(scan: dict, recipient_name: str) -> tuple[str, str]:
    subject = f"AI analysis failed · {scan.get('patient_name', 'Scan')}"
    err = (scan.get("error_message") or "Unknown error")[:300]
    html = _wrap(
        f"""
        <p style="margin:0 0 18px;font-size:15px;color:#334155;">
          Hi {recipient_name.split(' ')[0] if recipient_name else 'doctor'}, the AI was unable to complete
          analysis for this scan. The scan is preserved in your history — you can review the image manually
          or retry by uploading a clearer version.
        </p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;color:#991b1b;font-size:13px;font-family:monospace;">
          {err}
        </div>
        {_patient_block(scan)}
        <div style="margin-top:24px;">
          {_button('View scan →', _scan_link(scan['id']))}
        </div>
        """,
        "AI analysis failed",
    )
    return subject, html


def _build_signed(scan: dict, recipient_name: str) -> tuple[str, str]:
    review = scan.get("review") or {}
    signer = review.get("signed_by_name") or "—"
    signer_license = review.get("signed_by_license") or "—"
    signed_at = review.get("signed_at") or "—"
    notes = (review.get("notes") or "").strip()
    notes_html = (
        f'<div style="margin-top:14px;padding:14px;background:#ecfdf5;border-left:3px solid #10b981;border-radius:6px;color:#064e3b;font-size:14px;font-style:italic;">"{notes}"</div>'
        if notes
        else ""
    )
    subject = f"Report signed off · {scan.get('patient_name', 'Scan')}"
    html = _wrap(
        f"""
        <p style="margin:0 0 18px;font-size:15px;color:#334155;">
          The report for <strong>{scan.get('patient_name', 'this patient')}</strong> has been formally
          signed off by a clinician and is now locked. You can download the signed PDF anytime.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:18px;">
          <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#15803d;font-weight:700;">Signed off</div>
          <div style="font-size:17px;font-weight:700;margin-top:6px;">{signer}</div>
          <div style="font-size:13px;color:#475569;">License {signer_license} · {signed_at}</div>
          {notes_html}
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;margin-top:16px;">
          {_result_summary_html(scan)}
        </div>
        {_patient_block(scan)}
        <div style="margin-top:24px;">
          {_button('Open signed report →', _scan_link(scan['id']))}
        </div>
        """,
        "Report signed off",
    )
    return subject, html


_BUILDERS = {
    "completed": _build_completed,
    "error": _build_error,
    "signed_off": _build_signed,
}


async def send_scan_email(event: str, scan: dict, recipient_email: str, recipient_name: str = "") -> None:
    """Fire-and-forget email send. Never raises — failures are logged only."""
    if not _enabled():
        logger.info("Resend not configured — skipping %s email", event)
        return
    builder = _BUILDERS.get(event)
    if not builder:
        logger.warning("Unknown email event: %s", event)
        return
    if not recipient_email:
        return

    try:
        subject, html = builder(scan, recipient_name)
        params = {
            "from": SENDER_EMAIL,
            "to": [recipient_email],
            "subject": subject,
            "html": html,
        }

        def _send():
            return resend.Emails.send(params)

        result = await asyncio.to_thread(_send)
        logger.info("Sent %s email to %s (id=%s)", event, recipient_email, (result or {}).get("id"))
    except Exception as e:  # noqa: BLE001 - email is best-effort
        logger.warning("Failed to send %s email to %s: %s", event, recipient_email, e)
