"""Sync leads from a multi-tab Google Sheet into the alok_lms `leads` table.

Reads configured tabs via a service account, normalizes each row, dedupes by
email (against existing rows + within the run), auto-detects industry segment
when missing, and bulk-inserts new rows with status='raw'.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Iterable, Optional

import gspread
from google.oauth2.service_account import Credentials

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal  # noqa: E402
from models import Lead, INDUSTRY_SEGMENTS  # noqa: E402

SHEET_ID = "10Ht4PZGFJ1SjkwvzzbvtiLf7MJJ2Kq_U6GI7koAvhPA"
SERVICE_ACCOUNT_FILE = "/Users/exports/alok-steels-service-account.json"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

DEFAULT_STATUS = "raw"
BATCH_SIZE = 1000

# (worksheet title, source value) — order matters: earlier tabs win on dedup.
TABS: list[tuple[str, str]] = [
    ("Apollo_scrapped", "apollo"),
    ("Scrapping Data", "apollo"),
    ("Lusha_old_data", "lusha"),
    ("Contact", "manual"),
]

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "email":            ("emails", "all emails", "email", "email address", "e-mail"),
    "contact_name":     ("full_name", "full name", "name", "contact person", "contact name"),
    "company_name":     ("company_name", "company name", "company", "company_name ", "organization", "organisation"),
    "phone":            ("company_phone", "phone", "phone number", "mobile", "contact", "all phones", "contact_number", "contact number"),
    "country":          ("country",),
    "industry_segment": ("company_industry", "industry", "segment", "industry/segment", "industry segment"),
    "linkedin_url":     ("linkedin_url", "linkedin", "linkedin url", "linkedin profile", "company_linkedin", "linkedin company page"),
}

LINKEDIN_MAX_LEN = 500

SEGMENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "pumps":        ("pump",),
    "valves":       ("valve",),
    "pneumatics":   ("pneumatic",),
    "defense":      ("defense", "defence", "military", "ordnance", "aerospace"),
    "stockholders": ("stockholder", "stockist", "steel stock", "distribution", "distributor"),
    "cnc":          ("cnc", "machining", "machine shop", "machine tool"),
    "forging":      ("forge", "forging"),
}

EMAIL_SPLIT_RE = re.compile(r"[,;\s]+")
EMAIL_VALID_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_SPLIT_RE = re.compile(r"[,;/]")
PHONE_MAX_LEN = 32


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def build_header_map(headers: list[str]) -> dict[str, Optional[int]]:
    norm_headers = [_norm(h) for h in headers]
    mapping: dict[str, Optional[int]] = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        idx = None
        for alias in aliases:
            if alias in norm_headers:
                idx = norm_headers.index(alias)
                break
        mapping[canonical] = idx
    return mapping


def cell(row: list[str], idx: Optional[int]) -> str:
    if idx is None or idx >= len(row):
        return ""
    return (row[idx] or "").strip()


def first_email(raw: str) -> str:
    if not raw:
        return ""
    for piece in EMAIL_SPLIT_RE.split(raw):
        piece = piece.strip().lower()
        if EMAIL_VALID_RE.match(piece):
            return piece
    return ""


def clean_phone(raw: str) -> Optional[str]:
    if not raw:
        return None
    first = PHONE_SPLIT_RE.split(raw, maxsplit=1)[0].strip()
    if not first or first.upper() in {"#N/A", "N/A", "NA", "NULL"}:
        return None
    return first[:PHONE_MAX_LEN]


def detect_segment(company_name: str, raw_segment: str) -> str:
    raw = _norm(raw_segment)
    if raw in INDUSTRY_SEGMENTS:
        return raw
    haystack = f"{company_name} {raw_segment}".lower()
    for segment, keywords in SEGMENT_KEYWORDS.items():
        if any(kw in haystack for kw in keywords):
            return segment
    return "others"


def open_sheet():
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(
            f"Service account key not found at {SERVICE_ACCOUNT_FILE}"
        )
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    return gspread.authorize(creds).open_by_key(SHEET_ID)


def chunks(seq: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def main() -> int:
    sh = open_sheet()
    db = SessionLocal()
    grand_total = grand_imported = grand_dup = grand_blank = 0
    per_tab: list[tuple[str, int, int, int, int]] = []

    try:
        existing_emails = {
            e.lower()
            for (e,) in db.query(Lead.email).filter(Lead.email.isnot(None)).all()
            if e
        }
        seen: set[str] = set()
        print(f"Existing emails in DB: {len(existing_emails)}")

        for title, source in TABS:
            try:
                ws = sh.worksheet(title)
            except gspread.WorksheetNotFound:
                print(f"[skip] worksheet not found: {title}")
                continue

            print(f"\n>>> Reading: {title} (source={source})")
            rows = ws.get_all_values()
            if not rows:
                print("   (empty)")
                continue
            headers, *data_rows = rows
            hmap = build_header_map(headers)
            if hmap["email"] is None:
                print(f"   [skip] no email column. headers={headers}")
                continue

            total = len(data_rows)
            imported = dup = blank = 0
            pending: list[dict] = []

            for row in data_rows:
                email = first_email(cell(row, hmap["email"]))
                if not email:
                    blank += 1
                    continue
                if email in existing_emails or email in seen:
                    dup += 1
                    continue

                company_name = cell(row, hmap["company_name"])
                pending.append({
                    "company_name":     company_name or "(unknown)",
                    "contact_name":     cell(row, hmap["contact_name"]) or None,
                    "email":            email,
                    "phone":            clean_phone(cell(row, hmap["phone"])),
                    "country":          cell(row, hmap["country"]) or "India",
                    "industry_segment": detect_segment(company_name, cell(row, hmap["industry_segment"])),
                    "linkedin_url":     (cell(row, hmap["linkedin_url"])[:LINKEDIN_MAX_LEN] or None),
                    "source":           source,
                    "status":           DEFAULT_STATUS,
                })
                seen.add(email)
                imported += 1

            for batch in chunks(pending, BATCH_SIZE):
                db.bulk_insert_mappings(Lead, batch)
                db.commit()

            print(f"   total={total} imported={imported} dup={dup} blank={blank}")
            per_tab.append((title, total, imported, dup, blank))
            grand_total += total
            grand_imported += imported
            grand_dup += dup
            grand_blank += blank

    finally:
        db.close()

    print("\n" + "=" * 60)
    print(f"{'tab':<25} {'total':>8} {'imp':>8} {'dup':>8} {'blank':>8}")
    print("-" * 60)
    for title, t, i, d, b in per_tab:
        print(f"{title:<25} {t:>8} {i:>8} {d:>8} {b:>8}")
    print("-" * 60)
    print(f"{'TOTAL':<25} {grand_total:>8} {grand_imported:>8} {grand_dup:>8} {grand_blank:>8}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
