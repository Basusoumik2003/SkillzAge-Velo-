from __future__ import annotations

import html
import json
import logging
from typing import Any
from urllib.parse import quote

import requests

from app.core.config import Settings
from app.db.github_models import CodeReview, GitHubRepository
from app.db.models import User

logger = logging.getLogger(__name__)


def _is_graph_configured(settings: Settings) -> bool:
    return all([settings.tenant_id, settings.client_id, settings.client_secret, settings.mailbox])


def _parse_review_payload(review_feedback: str) -> dict[str, Any]:
    try:
        payload = json.loads(review_feedback or "{}")
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {"safe_student_feedback": review_feedback or ""}


def _safe_list(payload: dict[str, Any], key: str) -> list[str]:
    return [str(item) for item in (payload.get(key) or []) if item]


def _build_list(items: list[str]) -> str:
    if not items:
        return '<p style="margin:8px 0 0; color:#64748b;">No specific items reported.</p>'
    rendered = "".join(
        f'<li style="margin:8px 0; color:#334155;">{html.escape(item)}</li>'
        for item in items[:6]
    )
    return f'<ul style="margin:8px 0 0; padding-left:20px;">{rendered}</ul>'


def _build_review_email_html(user: User, review: CodeReview, payload: dict[str, Any]) -> str:
    name = html.escape(user.name or "there")
    project_name = html.escape(review.project_name or "InternLabs Project")
    commit = html.escape((review.commit_hash or "")[:8])
    score = html.escape(str(payload.get("score", "N/A")))
    passing_score = html.escape(str(payload.get("passing_score", 80)))
    status = html.escape(str(payload.get("status", "reviewed")).title())
    insight_level = html.escape(str(payload.get("insight_level", "low")).title())
    feedback = html.escape(str(payload.get("safe_student_feedback") or "Your review is ready."))

    strengths = _build_list(_safe_list(payload, "strengths"))
    missing_items = _build_list(_safe_list(payload, "missing_items"))
    weak_areas = _build_list(_safe_list(payload, "weak_areas"))

    return f"""
    <!doctype html>
    <html>
      <body style="margin:0; padding:0; background:#f5f7fb; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:#f5f7fb;">
          <tr>
            <td align="center" style="padding:28px 12px;">
              <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%; max-width:640px; background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 18px 45px rgba(15,23,42,0.12);">
                <tr>
                  <td style="padding:30px 34px; background:#fff2e8;">
                    <div style="font-size:28px; line-height:34px; font-weight:800; color:#070b18;">InternzBee Code Review</div>
                    <p style="margin:12px 0 0; font-size:16px; line-height:24px; color:#475569;">Hi {name}, your latest project review is complete.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 34px 18px;">
                    <h1 style="margin:0 0 8px; font-size:24px; line-height:32px; color:#0f172a;">{project_name}</h1>
                    <p style="margin:0; font-size:14px; line-height:22px; color:#64748b;">Commit {commit}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 34px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                          <div style="font-size:13px; color:#64748b;">Score</div>
                          <div style="margin-top:4px; font-size:30px; line-height:36px; font-weight:800; color:#f45113;">{score}/{passing_score}</div>
                        </td>
                        <td width="12"></td>
                        <td style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
                          <div style="font-size:13px; color:#64748b;">Status</div>
                          <div style="margin-top:4px; font-size:22px; line-height:30px; font-weight:800; color:#0f172a;">{status}</div>
                          <div style="font-size:13px; color:#64748b;">Insight: {insight_level}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 34px 24px;">
                    <h2 style="margin:0 0 8px; font-size:18px; line-height:26px; color:#0f172a;">Feedback</h2>
                    <p style="margin:0; font-size:15px; line-height:24px; color:#334155;">{feedback}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 34px 28px;">
                    <h2 style="margin:0 0 8px; font-size:18px; line-height:26px; color:#0f172a;">Strengths</h2>
                    {strengths}
                    <h2 style="margin:22px 0 8px; font-size:18px; line-height:26px; color:#0f172a;">Missing Items</h2>
                    {missing_items}
                    <h2 style="margin:22px 0 8px; font-size:18px; line-height:26px; color:#0f172a;">Weak Areas</h2>
                    {weak_areas}
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 34px; background:#fff7ed;">
                    <p style="margin:0; font-size:14px; line-height:22px; color:#475569;">Open your InternzBee workspace for full review history and next steps.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def _get_microsoft_token(settings: Settings) -> str:
    token_url = f"https://login.microsoftonline.com/{settings.tenant_id}/oauth2/v2.0/token"
    response = requests.post(
        token_url,
        data={
            "client_id": settings.client_id,
            "client_secret": settings.client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=20,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Microsoft token request failed: {response.status_code} {response.text}")
    return str(response.json().get("access_token") or "")


def send_review_result_email(settings: Settings, user: User, review: CodeReview) -> dict[str, str]:
    if not settings.review_email_enabled:
        return {"status": "skipped", "reason": "Review email is disabled."}
    if not user.email:
        return {"status": "skipped", "reason": "User email is missing."}
    if not _is_graph_configured(settings):
        return {"status": "skipped", "reason": "Microsoft Graph mail is not configured."}

    try:
        payload = _parse_review_payload(review.review_feedback)
        access_token = _get_microsoft_token(settings)
        if not access_token:
            raise RuntimeError("Microsoft token response did not include access_token.")

        mailbox = quote(settings.mailbox, safe="")
        send_mail_url = f"https://graph.microsoft.com/v1.0/users/{mailbox}/sendMail"
        subject = f"InternzBee Code Review - Code Review Result: {review.project_name}"
        response = requests.post(
            send_mail_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "message": {
                    "subject": subject,
                    "body": {
                        "contentType": "HTML",
                        "content": _build_review_email_html(user, review, payload),
                    },
                    "toRecipients": [
                        {
                            "emailAddress": {
                                "address": user.email,
                            }
                        }
                    ],
                },
                "saveToSentItems": False,
            },
            timeout=20,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Graph sendMail failed: {response.status_code} {response.text}")
        return {"status": "sent"}
    except Exception as exc:
        logger.warning("Review result email failed for user_id=%s review_id=%s: %s", user.id, review.id, exc)
        return {"status": "failed", "reason": str(exc)}


def send_review_summary_email(
    settings: Settings,
    user: User,
    repository: GitHubRepository,
    review_row: CodeReview,
) -> dict[str, str]:
    return send_review_result_email(settings, user, review_row)
