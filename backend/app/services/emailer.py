from __future__ import annotations

import hashlib
import imaplib
import re
import smtplib
from datetime import datetime, timedelta, timezone
from email import message_from_bytes, policy
from email.header import decode_header, make_header
from email.message import EmailMessage
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape
from typing import Any

from app.services.store import (
    add_application,
    add_email_reply,
    list_applications,
    update_application,
)

QQ_SMTP_HOST = "smtp.qq.com"
QQ_SMTP_PORT = 465
QQ_IMAP_HOST = "imap.qq.com"
QQ_IMAP_PORT = 993

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


class EmailError(Exception):
    pass


class EmailNotConfigured(EmailError):
    pass


def find_email(value: Any) -> str:
    """Recursively find the first plausible recruiting email in a job payload."""
    if isinstance(value, str):
        match = EMAIL_RE.search(value)
        return match.group(0) if match else ""
    if isinstance(value, dict):
        for key in ("email", "contact_email", "contactEmail", "hrEmail", "mail", "description", "requirement", "jobDescription", "content"):
            if key in value:
                found = find_email(value[key])
                if found:
                    return found
        for item in value.values():
            found = find_email(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = find_email(item)
            if found:
                return found
    return ""


def _clean(value: Any) -> str:
    return str(value or "").strip()


def compose_application_email(
    resume: dict[str, Any],
    job: dict[str, Any],
    match: dict[str, Any] | None = None,
) -> dict[str, str]:
    basics = resume.get("basics") or {}
    name = _clean(basics.get("name")) or "求职者"
    phone = _clean(basics.get("phone"))
    email = _clean(basics.get("email"))
    city = _clean(basics.get("city"))
    title = _clean(job.get("title")) or _clean(job.get("job_name")) or "目标岗位"
    company = _clean(job.get("company")) or "贵公司"
    source = _clean(job.get("source"))
    jd_url = _clean(job.get("url")) or _clean(job.get("jd_url"))

    matched = [str(item) for item in (match or {}).get("matched") or [] if str(item).strip()]
    skills = [
        _clean(item.get("name"))
        for item in resume.get("skills") or []
        if isinstance(item, dict) and _clean(item.get("name"))
    ]
    strengths = matched or skills[:5]
    highlights: list[str] = []
    for item in resume.get("work") or []:
        if isinstance(item, dict):
            highlights.extend(str(v).strip() for v in item.get("highlights") or [] if str(v).strip())
    for item in resume.get("projects") or []:
        if isinstance(item, dict) and item.get("description"):
            highlights.append(str(item["description"]).strip())
    highlights = [item for item in highlights if item][:2]

    subject = f"应聘{title}｜{name}｜简历与岗位匹配说明"
    greeting = f"尊敬的{company}招聘负责人："
    intro = f"您好！我是{name}，从{'猎聘' if source == 'liepin' else '贵公司官网'}看到「{title}」岗位，现附上简历，申请该职位。"
    if city:
        intro += f"我目前所在地为{city}，可配合岗位安排。"

    match_lines: list[str] = []
    if strengths:
        match_lines.append("结合岗位要求，我的匹配点包括：" + "、".join(strengths[:5]) + "。")
    if highlights:
        match_lines.append("近期可量化的工作成果：" + "；".join(highlights) + "。")
    if not match_lines:
        match_lines.append("我具备该岗位所需的基础能力，并愿意在入职后快速补齐业务知识。")

    closing = "随信附上 Word/PDF 版简历，期待有机会进一步沟通。感谢您的时间！"
    signature_parts = [name]
    if phone:
        signature_parts.append(phone)
    if email:
        signature_parts.append(email)
    if jd_url:
        signature_parts.append(f"岗位链接：{jd_url}")

    body = "\n\n".join(
        [
            greeting,
            intro,
            "\n".join(match_lines),
            closing,
            "此致\n敬礼",
            "\n".join(signature_parts),
        ]
    )
    return {"subject": subject, "body": body, "to": _clean(job.get("email") or job.get("contact_email"))}


def _attachment_payloads(resume: dict[str, Any], template_id: str) -> list[tuple[str, bytes, str, str]]:
    from app.services.resume_docx import build_resume_docx
    from app.services.resume_pdf import build_resume_pdf

    return [
        ("resume.docx", build_resume_docx(resume, template_id=template_id), "application", "vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("resume.pdf", build_resume_pdf(resume, template_id=template_id), "application", "pdf"),
    ]


def send_qq_email(
    account: str,
    auth_code: str,
    to: str,
    subject: str,
    body: str,
    resume: dict[str, Any],
    template_id: str = "classic",
) -> dict[str, Any]:
    account = account.strip()
    auth_code = auth_code.strip()
    to = to.strip().replace("\r", "").replace("\n", "")
    subject = subject.replace("\r", " ").replace("\n", " ").strip()
    if not account or not auth_code:
        raise EmailNotConfigured("请先在「投递中心」填写 QQ 邮箱和 SMTP 授权码。")
    if not EMAIL_RE.fullmatch(to):
        raise EmailError("收件邮箱格式不正确。")
    if not account or "@" not in account:
        raise EmailError("QQ 邮箱格式不正确。")

    message = EmailMessage()
    message["From"] = account
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    for filename, data, maintype, subtype in _attachment_payloads(resume, template_id):
        message.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)

    try:
        with smtplib.SMTP_SSL(QQ_SMTP_HOST, QQ_SMTP_PORT, timeout=30) as smtp:
            smtp.login(account, auth_code)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise EmailError("QQ 邮箱登录失败，请确认使用的是 SMTP 授权码，而不是 QQ 密码。") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise EmailError(f"邮件发送失败：{exc}") from exc
    return {"to": to, "subject": subject, "attachments": ["resume.docx", "resume.pdf"]}


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _html_to_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _message_body(message) -> str:
    if message.is_multipart():
        chunks: list[str] = []
        for part in message.walk():
            if part.get_content_maintype() == "multipart":
                continue
            if part.get_content_type() == "text/plain":
                try:
                    chunks.append(part.get_content())
                except Exception:
                    pass
        if chunks:
            return "\n".join(chunks).strip()
        for part in message.walk():
            if part.get_content_type() == "text/html":
                try:
                    return _html_to_text(part.get_content())
                except Exception:
                    pass
        return ""
    try:
        content = message.get_content()
        return _html_to_text(content) if message.get_content_type() == "text/html" else content.strip()
    except Exception:
        return ""


def classify_reply(subject: str, body: str) -> str:
    text = f"{subject}\n{body}".lower()
    if any(word in text for word in ("面试", "面谈", "interview", "复试", "笔试")):
        return "interview"
    if any(word in text for word in ("录用", "录取", "offer", "入职通知", "恭喜您通过")):
        return "offer"
    if any(word in text for word in ("不合适", "未通过", "遗憾", "感谢您", "暂不考虑", "reject")):
        return "rejected"
    if any(word in text for word in ("已查看", "已读", "已阅", "viewed")):
        return "viewed"
    return "unknown"


def _match_application(applications: list[dict[str, Any]], from_addr: str, subject: str, body: str) -> dict[str, Any] | None:
    from_lower = from_addr.lower()
    text = f"{subject}\n{body}".lower()
    by_email = [item for item in applications if item.get("contact_email") and item["contact_email"].lower() == from_lower]
    if by_email:
        return by_email[0]
    scored: list[tuple[int, dict[str, Any]]] = []
    for item in applications:
        score = 0
        company = str(item.get("company") or "").lower()
        title = str(item.get("title") or "").lower()
        if company and company in text:
            score += 3
        if title and title in text:
            score += 2
        if score:
            scored.append((score, item))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return scored[0][1] if scored else None


def sync_qq_replies(
    session_id: str,
    account: str,
    auth_code: str,
    days: int = 45,
    limit: int = 30,
) -> dict[str, Any]:
    account = account.strip()
    auth_code = auth_code.strip()
    if not account or not auth_code:
        raise EmailNotConfigured("请先在「投递中心」填写 QQ 邮箱和 IMAP 授权码。")

    since = (datetime.now() - timedelta(days=max(1, min(days, 120)))).strftime("%d-%b-%Y")
    applications = list_applications(session_id)
    inserted = 0
    updated = 0
    replies: list[dict[str, Any]] = []
    try:
        with imaplib.IMAP4_SSL(QQ_IMAP_HOST, QQ_IMAP_PORT) as imap:
            imap.login(account, auth_code)
            imap.select("INBOX")
            status, data = imap.uid("search", None, f'(SINCE "{since}")')
            if status != "OK":
                raise EmailError("无法搜索 QQ 邮箱收件箱。")
            uids = (data[0] or b"").split()
            for uid in uids[-max(1, min(limit, 100)):]:
                status, fetched = imap.uid("fetch", uid, "(BODY.PEEK[])")
                if status != "OK" or not fetched:
                    continue
                raw = b""
                for part in fetched:
                    if isinstance(part, tuple) and len(part) > 1:
                        raw = part[1]
                        break
                if not raw:
                    continue
                message = message_from_bytes(raw, policy=policy.default)
                message_id = _decode(message.get("Message-ID")) or hashlib.sha1(raw).hexdigest()
                subject = _decode(message.get("Subject"))
                from_addr = parseaddr(_decode(message.get("From")))[1]
                if not from_addr:
                    continue
                body = _message_body(message)
                snippet = re.sub(r"\s+", " ", body)[:180]
                category = classify_reply(subject, body)
                reply_date = ""
                try:
                    parsed = parsedate_to_datetime(message.get("Date"))
                    reply_date = parsed.isoformat(timespec="seconds")
                except Exception:
                    reply_date = datetime.now(timezone.utc).isoformat(timespec="seconds")
                matched = _match_application(applications, from_addr, subject, body)
                reply = {
                    "uid": message_id,
                    "from_addr": from_addr,
                    "subject": subject,
                    "snippet": snippet,
                    "body": body[:4000],
                    "category": category,
                    "received_at": reply_date,
                    "application_id": matched.get("id") if matched else None,
                }
                if add_email_reply(session_id, reply):
                    inserted += 1
                    replies.append(reply)
                if matched:
                    if category in {"viewed", "interview", "offer", "rejected"}:
                        updated += 1
                        update_application(
                            session_id,
                            int(matched["id"]),
                            status=category,
                            status_source="email",
                            last_reply_at=reply_date,
                            note=f"自动识别回信：{subject[:80]}",
                        )
                    else:
                        update_application(
                            session_id,
                            int(matched["id"]),
                            last_reply_at=reply_date,
                            note=f"收到回信，待确认状态：{subject[:80]}",
                        )
    except imaplib.IMAP4.error as exc:
        raise EmailError("QQ 邮箱 IMAP 登录失败，请确认邮箱已开启 IMAP 并使用授权码。") from exc
    except OSError as exc:
        raise EmailError(f"连接 QQ 邮箱失败：{exc}") from exc

    return {
        "fetched": len(uids) if "uids" in locals() else 0,
        "inserted": inserted,
        "updated": updated,
        "replies": replies,
    }


def record_email_application(
    session_id: str,
    job: dict[str, Any],
    to: str,
    subject: str,
) -> dict[str, Any]:
    """Create/update the local application row after an email is sent."""
    payload = dict(job)
    payload.setdefault("job_kind", "email")
    payload.setdefault("source", "email")
    payload["contact_email"] = to
    payload["email_subject"] = subject
    payload["email_sent_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload.setdefault("status", "submitted")
    payload.setdefault("status_source", "manual")
    return add_application(session_id, payload)
