import os
import re
import secrets
import string
import urllib.parse
import logging
from typing import Dict, Optional
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv

load_dotenv()

otp_sessions: Dict[str, dict] = {}
logger = logging.getLogger("lms.otp")


def generate_otp() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


def generate_session_id() -> str:
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))


def _sms_mode() -> str:
    return os.getenv("SMS_MODE", "mock").strip().lower()


def _normalize_country_code(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if not raw.startswith("+"):
        raw = f"+{raw}"
    digits = re.sub(r"[^\d]", "", raw)
    if not digits:
        return None
    return f"+{digits}"


def _normalize_phone_for_interakt(phone_no: str, country_code: Optional[str]) -> tuple[str, str, str]:
    raw = str(phone_no or "").strip()
    if not raw:
        raise ValueError("Phone number is required")
    cleaned = re.sub(r"[\s\-()]", "", raw)
    cc_final = _normalize_country_code(country_code)
    digits = re.sub(r"[^\d]", "", cleaned)
    if not digits:
        raise ValueError("Phone number is invalid")

    national = digits.lstrip("0")
    if cleaned.startswith("+"):
        if cc_final:
            cc_digits = re.sub(r"[^\d]", "", cc_final)
            if digits.startswith(cc_digits):
                national = digits[len(cc_digits):].lstrip("0")
        else:
            for cc_len in (3, 2, 1):
                if len(digits) > cc_len:
                    candidate_national = digits[cc_len:].lstrip("0")
                    if 6 <= len(candidate_national) <= 15:
                        cc_final = f"+{digits[:cc_len]}"
                        national = candidate_national
                        break

    if not cc_final:
        cc_final = _normalize_country_code(os.getenv("INTERAKT_COUNTRY_CODE", "+91"))
    if not national or len(national) < 6 or len(national) > 15:
        raise ValueError("Phone number is invalid")
    e164 = f"{cc_final}{national}"
    return cc_final, national, e164


def _send_interakt_otp(phone_no: str, otp: str, country_code: Optional[str]) -> str:
    api_key = os.getenv("INTERAKT_API_KEY")
    template_name = os.getenv("INTERAKT_OTP_TEMPLATE_NAME", "login_otp")
    language = os.getenv("INTERAKT_TEMPLATE_LANGUAGE", "en")

    if not api_key:
        raise Exception("INTERAKT_API_KEY missing in env")

    url = "https://api.interakt.ai/v1/public/message/"
    headers = {
        "Authorization": f"Basic {api_key}",
        "Content-Type": "application/json",
    }

    cc_final, phone, _ = _normalize_phone_for_interakt(phone_no, country_code)

    payload = {
        "countryCode": cc_final,
        "phoneNumber": phone,
        "type": "Template",
        "callbackData": "purpose=login_otp",
        "template": {
            "name": template_name,
            "languageCode": language,
            "bodyValues": [otp],
        },
    }
    masked_phone = f"***{phone[-4:]}" if phone else "***"

    def _post_and_parse(p: dict):
        resp = requests.post(url, json=p, headers=headers, timeout=20)
        logger.info("Interakt OTP request: phone=%s status=%s", masked_phone, resp.status_code)
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
        return resp, data

    resp, data = _post_and_parse(payload)
    if resp.status_code >= 400:
        logger.warning("Interakt OTP response payload (no buttonValues): %s", data)
        payload_with_button = {
            **payload,
            "template": {
                **payload["template"],
                "buttonValues": {"0": [otp]},
            },
        }
        resp, data = _post_and_parse(payload_with_button)
        if resp.status_code >= 400:
            logger.error("Interakt OTP response payload (with buttonValues): %s", data)
            raise Exception(f"Interakt API error {resp.status_code}: {resp.text}")

    logger.info("Interakt OTP response payload: %s", data)
    status_value = str(data.get("status", "")).lower() if isinstance(data, dict) else ""
    message_value = str(data.get("message", "")).lower() if isinstance(data, dict) else ""
    if status_value in {"false", "failed", "error"} or "fail" in message_value or "error" in message_value:
        raise Exception(f"Interakt delivery failed: {data}")

    return otp


def _send_sms_live(phone_no: str, otp: str) -> str:
    message = f"ALOK LMS LOGIN OTP NO.{otp}."

    required_env = [
        "SMS_BASE_URL", "SMS_USER", "SMS_PASSWORD",
        "SMS_SENDER", "SMS_TYPE", "SMS_TEMPLATE_ID",
    ]
    missing = [key for key in required_env if not os.getenv(key)]
    if missing:
        raise Exception(f"SMS live mode misconfigured. Missing env: {', '.join(missing)}")

    params = {
        "user": os.getenv("SMS_USER"),
        "password": os.getenv("SMS_PASSWORD"),
        "mobile": phone_no,
        "message": message,
        "sender": os.getenv("SMS_SENDER"),
        "type": os.getenv("SMS_TYPE"),
        "template_id": os.getenv("SMS_TEMPLATE_ID"),
    }

    base_url = os.getenv("SMS_BASE_URL")
    query_string = urllib.parse.urlencode(params)
    full_url = f"{base_url}?{query_string}"

    response = requests.post(
        full_url,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    response.raise_for_status()

    result = (response.text or "").strip()
    if "failed" in result.lower() or "invalid" in result.lower():
        raise Exception(f"SMS API error: {result}")

    return otp


def send_message(phone_no: str, otp: str, country_code: Optional[str] = None) -> str:
    mode = _sms_mode()

    if mode == "mock":
        masked_phone = f"***{str(phone_no)[-4:]}" if phone_no else "***"
        logger.info("OTP mock mode | phone=%s | OTP=%s", masked_phone, otp)
        print(f"[LMS OTP MOCK] phone={masked_phone} otp={otp}")
        return otp

    if mode == "interakt":
        return _send_interakt_otp(phone_no, otp, country_code)

    if mode == "interakt_then_sms":
        try:
            return _send_interakt_otp(phone_no, otp, country_code)
        except Exception as e:
            masked_phone = f"***{str(phone_no)[-4:]}" if phone_no else "***"
            logger.warning("Interakt OTP failed for phone %s: %s", masked_phone, str(e))
            return _send_sms_live(phone_no, otp)

    return _send_sms_live(phone_no, otp)


def store_otp_session(session_id: str, ecode: str, otp: str, phone_number: str) -> None:
    expiry = datetime.now() + timedelta(minutes=5)
    otp_sessions[session_id] = {
        "ecode": ecode,
        "otp": otp,
        "phone_number": phone_number,
        "created_at": datetime.now(),
        "expires_at": expiry,
        "verified": False,
    }


def verify_otp_session(session_id: str, provided_otp: str) -> Optional[str]:
    if session_id not in otp_sessions:
        return None
    session = otp_sessions[session_id]
    if datetime.now() > session["expires_at"]:
        del otp_sessions[session_id]
        return None
    if session["otp"] == provided_otp:
        session["verified"] = True
        return session["ecode"]
    return None


def cleanup_expired_sessions():
    now = datetime.now()
    expired = [sid for sid, s in otp_sessions.items() if now > s["expires_at"]]
    for sid in expired:
        del otp_sessions[sid]
