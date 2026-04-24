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
from models import Lead  # noqa: E402

SHEETS = [
    {
        "sheet_id": "10Ht4PZGFJ1SjkwvzzbvtiLf7MJJ2Kq_U6GI7koAvhPA",
        "industry_segment": "pumps",
        "name": "All Data Pumps",
    },
    {
        "sheet_id": "1VLM2kE0yOP2d37NP4gEEzJols3A4CCyf_ONz1yjZIaY",
        "industry_segment": "valves",
        "name": "All_Valves_Top to bottom",
    },
    {
        "sheet_id": "1XrdYnAkwMto2htc1nbiYcQh_kn7PHVWFZitoMjEt-ic",
        "industry_segment": "cnc",
        "name": "CNC machined sheet",
    },
    {
        "sheet_id": "1EiTUEEdxI-fxUQxhuSfYzxaWQl-4bFF0revYHjFiFBI",
        "industry_segment": "defense",
        "name": "Defense_Buyers",
    },
]
SERVICE_ACCOUNT_FILE = "/Users/exports/alok-steels-service-account.json"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

DEFAULT_STATUS = "raw"
BATCH_SIZE = 1000

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "email":            ("emails", "all emails", "email", "email address", "e-mail"),
    "contact_name":     ("full_name", "full name", "name", "contact person", "contact name"),
    "company_name":     ("company_name", "company name", "company", "company_name ", "organization", "organisation"),
    "phone":            ("company_phone", "phone", "phone number", "mobile", "contact", "all phones", "contact_number", "contact number"),
    "country":          ("country",),
    "linkedin_url":     ("linkedin_url", "linkedin", "linkedin url", "linkedin profile", "company_linkedin", "linkedin company page"),
}

LINKEDIN_MAX_LEN = 500

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



def open_sheet(sheet_id: str):
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(
            f"Service account key not found at {SERVICE_ACCOUNT_FILE}"
        )
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    return gspread.authorize(creds).open_by_key(sheet_id)


def chunks(seq: list[dict], size: int) -> Iterable[list[dict]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def _clean_linkedin(raw: str) -> str | None:
    url = raw.strip()[:LINKEDIN_MAX_LEN] if raw else ""
    if not url or "linkedin.com" not in url.lower():
        return None
    return url


def main() -> int:
    db = SessionLocal()
    grand_imported = grand_dup = grand_linkedin = 0
    per_sheet: list[tuple[str, int, int, int]] = []

    try:
        # Dedup sets: emails + linkedin URLs already in DB
        existing_emails = {
            e.lower()
            for (e,) in db.query(Lead.email).filter(Lead.email.isnot(None)).all()
            if e
        }
        existing_linkedins = {
            u.lower()
            for (u,) in db.query(Lead.linkedin_url).filter(Lead.linkedin_url.isnot(None)).all()
            if u
        }
        seen_emails: set[str] = set()
        seen_linkedins: set[str] = set()
        print(f"Existing in DB: {len(existing_emails)} emails, {len(existing_linkedins)} linkedin URLs")

        for sheet_cfg in SHEETS:
            sheet_id = sheet_cfg["sheet_id"]
            sheet_segment = sheet_cfg["industry_segment"]
            sheet_name = sheet_cfg["name"]

            print(f"\n{'='*60}")
            print(f"Sheet: {sheet_name} (segment={sheet_segment})")
            print(f"{'='*60}")

            try:
                sh = open_sheet(sheet_id)
            except Exception as exc:
                print(f"[skip] could not open sheet {sheet_name}: {exc}")
                per_sheet.append((sheet_name, 0, 0, 0))
                continue

            sheet_imported = sheet_dup = sheet_linkedin = 0

            for ws in sh.worksheets():
                title = ws.title
                print(f"\n>>> Reading tab: {title}")
                rows = ws.get_all_values()
                if not rows:
                    print("   (empty)")
                    continue
                headers, *data_rows = rows
                hmap = build_header_map(headers)

                has_email_col = hmap["email"] is not None
                has_linkedin_col = hmap["linkedin_url"] is not None

                if not has_email_col and not has_linkedin_col:
                    print(f"   [skip] no email or linkedin column. headers={headers[:10]}")
                    continue

                pending: list[dict] = []

                for row in data_rows:
                    email = first_email(cell(row, hmap["email"])) if has_email_col else ""
                    linkedin = _clean_linkedin(cell(row, hmap["linkedin_url"])) if has_linkedin_col else None

                    if email:
                        # Dedup by email
                        if email in existing_emails or email in seen_emails:
                            sheet_dup += 1
                            continue
                        company_name = cell(row, hmap["company_name"])
                        pending.append({
                            "company_name":     company_name or "(unknown)",
                            "contact_name":     cell(row, hmap["contact_name"]) or None,
                            "email":            email,
                            "has_email":        True,
                            "phone":            clean_phone(cell(row, hmap["phone"])),
                            "country":          cell(row, hmap["country"]) or "India",
                            "industry_segment": sheet_segment,
                            "linkedin_url":     linkedin,
                            "source":           "google_sheet",
                            "status":           DEFAULT_STATUS,
                        })
                        seen_emails.add(email)
                        sheet_imported += 1

                    elif linkedin:
                        # No email but has linkedin — import as profile-only lead
                        li_key = linkedin.lower()
                        if li_key in existing_linkedins or li_key in seen_linkedins:
                            sheet_dup += 1
                            continue
                        company_name = cell(row, hmap["company_name"])
                        pending.append({
                            "company_name":     company_name or "(unknown)",
                            "contact_name":     cell(row, hmap["contact_name"]) or None,
                            "email":            None,
                            "has_email":        False,
                            "phone":            clean_phone(cell(row, hmap["phone"])),
                            "country":          cell(row, hmap["country"]) or "India",
                            "industry_segment": sheet_segment,
                            "linkedin_url":     linkedin,
                            "source":           "google_sheet",
                            "status":           DEFAULT_STATUS,
                        })
                        seen_linkedins.add(li_key)
                        sheet_linkedin += 1
                        sheet_imported += 1

                    else:
                        # No email, no linkedin — skip
                        continue

                for batch in chunks(pending, BATCH_SIZE):
                    db.bulk_insert_mappings(Lead, batch)
                    db.commit()

                print(f"   tab rows={len(data_rows)} imported={len(pending)}")

            per_sheet.append((sheet_name, sheet_imported, sheet_dup, sheet_linkedin))
            grand_imported += sheet_imported
            grand_dup += sheet_dup
            grand_linkedin += sheet_linkedin

    finally:
        db.close()

    # ── Summary ──
    print("\n")
    label_width = max(len(name) for name, *_ in per_sheet) + 2
    for name, imp, dup, li in per_sheet:
        label = f"{name}:"
        print(f"{label:<{label_width}} {imp:>6} imported | {dup:>6} duplicates | {li:>6} linkedin-only")
    print("\u2500" * 60)
    label = "TOTAL:"
    print(f"{label:<{label_width}} {grand_imported:>6} imported | {grand_dup:>6} duplicates | {grand_linkedin:>6} linkedin-only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
