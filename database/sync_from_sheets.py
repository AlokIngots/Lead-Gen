"""Sync leads AND company-level data from multi-tab Google Sheets into alok_lms.

Lead sync: reads all tabs, normalizes rows, dedupes by email/linkedin, bulk-inserts.
Company sync: reads specific summary/company tabs per sheet, upserts into `companies`
table, then links existing leads to their company via company_name match.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional

import gspread
from google.oauth2.service_account import Credentials

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal  # noqa: E402
from models import Lead, Company  # noqa: E402

SHEETS = [
    {
        "sheet_id": "10Ht4PZGFJ1SjkwvzzbvtiLf7MJJ2Kq_U6GI7koAvhPA",
        "industry_segment": "pumps",
        "name": "All Data Pumps",
        "company_tabs": ["new_company_names", "linkedin_connections_tracking"],
    },
    {
        "sheet_id": "1VLM2kE0yOP2d37NP4gEEzJols3A4CCyf_ONz1yjZIaY",
        "industry_segment": "valves",
        "name": "All_Valves_Top to bottom",
        "company_tabs": ["company_name"],
    },
    {
        "sheet_id": "1XrdYnAkwMto2htc1nbiYcQh_kn7PHVWFZitoMjEt-ic",
        "industry_segment": "cnc",
        "name": "CNC machined sheet",
        "company_tabs": ["Company Name", "Summary"],
    },
    {
        "sheet_id": "1EiTUEEdxI-fxUQxhuSfYzxaWQl-4bFF0revYHjFiFBI",
        "industry_segment": "defense",
        "name": "Defense_Buyers",
        "company_tabs": ["Summary by Region", "Defense Steel Buyers (417)"],
    },
]
SERVICE_ACCOUNT_FILE = "/Users/exports/alok-steels-service-account.json"
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

DEFAULT_STATUS = "raw"
BATCH_SIZE = 1000

# ── Column aliases for LEAD-level tabs ──

COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "email":            ("emails", "all emails", "email", "email address", "e-mail"),
    "contact_name":     ("full_name", "full name", "name", "contact person", "contact name"),
    "company_name":     ("company_name", "company name", "company", "company_name ", "organization", "organisation"),
    "phone":            ("company_phone", "phone", "phone number", "mobile", "contact", "all phones", "contact_number", "contact number"),
    "country":          ("country",),
    "linkedin_url":     ("linkedin_url", "linkedin", "linkedin url", "linkedin profile", "company_linkedin", "linkedin company page"),
}

# ── Column aliases for COMPANY-level tabs ──

COMPANY_COL_ALIASES: dict[str, tuple[str, ...]] = {
    "company_name": (
        "company name", "company_name", "company", "organization",
        "organisation", "firm", "firm name", "name", "company_name ",
    ),
    "total_scraped": (
        "total scraped", "total profiles", "total_scraped", "profiles",
        "scraped", "total", "no. of profiles", "profiles scraped",
        "total contacts", "contacts",
    ),
    "emails_sent": (
        "emails sent", "emails_sent", "email sent", "sent",
        "emails sent count", "mails sent", "sent count",
    ),
    "scrapped_date": (
        "scrapped date", "scrapped_date", "date scraped", "scraped date",
        "date", "scrape date", "scrapped",
    ),
    "status": (
        "status", "company status", "current status", "stage",
    ),
    "country": (
        "country", "region", "location",
    ),
}

LINKEDIN_MAX_LEN = 500

EMAIL_SPLIT_RE = re.compile(r"[,;\s]+")
EMAIL_VALID_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_SPLIT_RE = re.compile(r"[,;/]")
PHONE_MAX_LEN = 32


def _norm(s: str) -> str:
    return (s or "").strip().lower()


def build_header_map(headers: list[str], aliases: dict[str, tuple[str, ...]]) -> dict[str, Optional[int]]:
    norm_headers = [_norm(h) for h in headers]
    mapping: dict[str, Optional[int]] = {}
    for canonical, alias_list in aliases.items():
        idx = None
        for alias in alias_list:
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


def _parse_int(raw: str) -> int:
    """Extract integer from a cell, tolerating commas, spaces, etc."""
    if not raw:
        return 0
    cleaned = re.sub(r"[^\d]", "", raw)
    return int(cleaned) if cleaned else 0


def _parse_date(raw: str) -> Optional[datetime]:
    """Try common date formats from sheets."""
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y", "%d %b %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Company-level sync
# ─────���───────────────────────────────────────────────────────────────────────

def sync_companies_from_sheet(sh, sheet_cfg: dict, db) -> list[tuple[str, int]]:
    """Read company-level tabs from a sheet and upsert into the companies table.

    Returns list of (tab_name, companies_found) tuples.
    """
    segment = sheet_cfg["industry_segment"]
    company_tabs = sheet_cfg.get("company_tabs", [])
    tab_results: list[tuple[str, int]] = []

    if not company_tabs:
        return tab_results

    # Get available worksheet titles
    available_tabs = {ws.title: ws for ws in sh.worksheets()}

    for tab_name in company_tabs:
        if tab_name not in available_tabs:
            print(f"   [company] tab '{tab_name}' not found, skipping")
            tab_results.append((tab_name, 0))
            continue

        ws = available_tabs[tab_name]
        print(f"\n   [company] Reading tab: {tab_name}")
        rows = ws.get_all_values()
        if not rows:
            print(f"   [company] (empty)")
            tab_results.append((tab_name, 0))
            continue

        headers, *data_rows = rows
        hmap = build_header_map(headers, COMPANY_COL_ALIASES)

        # Must have at least a company name column
        if hmap["company_name"] is None:
            print(f"   [company] [skip] no company name column found. headers={headers[:10]}")
            tab_results.append((tab_name, 0))
            continue

        companies_found = 0

        for row in data_rows:
            name = cell(row, hmap["company_name"])
            if not name or name.upper() in {"#N/A", "N/A", "NA", "NULL", "TOTAL", "GRAND TOTAL", ""}:
                continue

            total_scraped = _parse_int(cell(row, hmap["total_scraped"]))
            emails_sent = _parse_int(cell(row, hmap["emails_sent"]))
            scrapped_date = _parse_date(cell(row, hmap["scrapped_date"]))
            status = cell(row, hmap["status"]) or None
            country = cell(row, hmap["country"]) or "India"

            # Upsert: check if company already exists for this name+segment
            existing = (
                db.query(Company)
                .filter(Company.name == name, Company.industry_segment == segment)
                .first()
            )

            if existing:
                # Update with latest data (prefer non-zero / non-null)
                if total_scraped > 0:
                    existing.total_scraped = total_scraped
                if emails_sent > 0:
                    existing.emails_sent = emails_sent
                if scrapped_date:
                    existing.scrapped_date = scrapped_date
                if status:
                    existing.status = status
                if country and country != "India":
                    existing.country = country
                existing.source_tab = tab_name
            else:
                db.add(Company(
                    name=name,
                    industry_segment=segment,
                    country=country,
                    total_scraped=total_scraped,
                    emails_sent=emails_sent,
                    scrapped_date=scrapped_date,
                    status=status,
                    source_tab=tab_name,
                ))

            companies_found += 1

        db.commit()
        print(f"   [company] tab '{tab_name}': {companies_found} companies upserted")
        tab_results.append((tab_name, companies_found))

    return tab_results


def link_leads_to_companies(db) -> int:
    """Link existing leads to companies via company_name match.

    Sets lead.company_id where company name and segment match.
    Returns number of leads linked.
    """
    # Get all companies as a lookup: (name_lower, segment) -> id
    companies = db.query(Company.id, Company.name, Company.industry_segment).all()
    company_lookup: dict[tuple[str, str], int] = {}
    for cid, cname, cseg in companies:
        company_lookup[(cname.lower(), cseg)] = cid

    if not company_lookup:
        return 0

    # Find unlinked leads
    unlinked = (
        db.query(Lead)
        .filter(Lead.company_id.is_(None))
        .all()
    )

    linked = 0
    for lead in unlinked:
        key = (lead.company_name.lower(), lead.industry_segment)
        cid = company_lookup.get(key)
        if cid:
            lead.company_id = cid
            linked += 1

    db.commit()
    return linked


# ─────────────────────────────────────────────────────────────────────────────
# Lead-level sync (original logic)
# ─────────────────────────────────────────────────────────────────────────────

def sync_leads_from_sheet(sh, sheet_cfg: dict, db, existing_emails: set, existing_linkedins: set,
                          seen_emails: set, seen_linkedins: set) -> tuple[int, int, int]:
    """Sync lead-level rows from all tabs in a sheet. Returns (imported, duplicates, linkedin_only)."""
    segment = sheet_cfg["industry_segment"]
    company_tabs = set(sheet_cfg.get("company_tabs", []))

    sheet_imported = sheet_dup = sheet_linkedin = 0

    for ws in sh.worksheets():
        title = ws.title

        # Skip company-level tabs (handled separately)
        if title in company_tabs:
            print(f"\n>>> Skipping tab (company-level): {title}")
            continue

        print(f"\n>>> Reading tab: {title}")
        rows = ws.get_all_values()
        if not rows:
            print("   (empty)")
            continue
        headers, *data_rows = rows
        hmap = build_header_map(headers, COLUMN_ALIASES)

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
                    "industry_segment": segment,
                    "linkedin_url":     linkedin,
                    "source":           "google_sheet",
                    "status":           DEFAULT_STATUS,
                })
                seen_emails.add(email)
                sheet_imported += 1

            elif linkedin:
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
                    "industry_segment": segment,
                    "linkedin_url":     linkedin,
                    "source":           "google_sheet",
                    "status":           DEFAULT_STATUS,
                })
                seen_linkedins.add(li_key)
                sheet_linkedin += 1
                sheet_imported += 1
            else:
                continue

        for batch in chunks(pending, BATCH_SIZE):
            db.bulk_insert_mappings(Lead, batch)
            db.commit()

        print(f"   tab rows={len(data_rows)} imported={len(pending)}")

    return sheet_imported, sheet_dup, sheet_linkedin


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ───���─────────────────────────────────────────────────────────────────────────

def main() -> int:
    db = SessionLocal()
    grand_imported = grand_dup = grand_linkedin = 0
    per_sheet: list[tuple[str, int, int, int]] = []
    company_summary: list[tuple[str, list[tuple[str, int]]]] = []

    try:
        # ── Phase 1: Company-level sync ──
        print("=" * 60)
        print("PHASE 1: Syncing company-level data")
        print("=" * 60)

        total_companies = 0

        for sheet_cfg in SHEETS:
            sheet_name = sheet_cfg["name"]
            company_tabs = sheet_cfg.get("company_tabs", [])

            if not company_tabs:
                print(f"\n[{sheet_name}] No company tabs configured, skipping")
                company_summary.append((sheet_name, []))
                continue

            print(f"\n{'─'*60}")
            print(f"Sheet: {sheet_name} (segment={sheet_cfg['industry_segment']})")
            print(f"  Company tabs to check: {company_tabs}")

            try:
                sh = open_sheet(sheet_cfg["sheet_id"])
            except Exception as exc:
                print(f"[skip] could not open sheet {sheet_name}: {exc}")
                company_summary.append((sheet_name, []))
                continue

            tab_results = sync_companies_from_sheet(sh, sheet_cfg, db)
            company_summary.append((sheet_name, tab_results))
            sheet_total = sum(count for _, count in tab_results)
            total_companies += sheet_total

        # ── Phase 2: Link leads to companies ──
        print(f"\n{'='*60}")
        print("PHASE 2: Linking leads to companies")
        print("=" * 60)

        linked = link_leads_to_companies(db)
        print(f"Linked {linked} leads to their companies")

        # ── Phase 3: Lead-level sync ──
        print(f"\n{'='*60}")
        print("PHASE 3: Syncing lead-level data")
        print("=" * 60)

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
            sheet_name = sheet_cfg["name"]
            print(f"\n{'─'*60}")
            print(f"Sheet: {sheet_name} (segment={sheet_cfg['industry_segment']})")

            try:
                sh = open_sheet(sheet_cfg["sheet_id"])
            except Exception as exc:
                print(f"[skip] could not open sheet {sheet_name}: {exc}")
                per_sheet.append((sheet_name, 0, 0, 0))
                continue

            imported, dups, li = sync_leads_from_sheet(
                sh, sheet_cfg, db,
                existing_emails, existing_linkedins,
                seen_emails, seen_linkedins,
            )
            per_sheet.append((sheet_name, imported, dups, li))
            grand_imported += imported
            grand_dup += dups
            grand_linkedin += li

        # ── Phase 4: Link newly imported leads to companies ──
        new_linked = link_leads_to_companies(db)
        if new_linked:
            print(f"\nLinked {new_linked} newly imported leads to companies")

    finally:
        db.close()

    # ── Summary ──
    print("\n")
    print("=" * 60)
    print("COMPANY SYNC SUMMARY")
    print("=" * 60)
    for sheet_name, tab_results in company_summary:
        if not tab_results:
            print(f"  {sheet_name}: (no company tabs)")
            continue
        sheet_total = sum(c for _, c in tab_results)
        print(f"  {sheet_name}: {sheet_total} companies total")
        for tab_name, count in tab_results:
            print(f"    - {tab_name}: {count}")
    print(f"  TOTAL: {total_companies} companies")

    print("\n")
    print("=" * 60)
    print("LEAD SYNC SUMMARY")
    print("=" * 60)
    label_width = max(len(name) for name, *_ in per_sheet) + 2 if per_sheet else 20
    for name, imp, dup, li in per_sheet:
        label = f"{name}:"
        print(f"  {label:<{label_width}} {imp:>6} imported | {dup:>6} duplicates | {li:>6} linkedin-only")
    print("  " + "\u2500" * 58)
    label = "TOTAL:"
    print(f"  {label:<{label_width}} {grand_imported:>6} imported | {grand_dup:>6} duplicates | {grand_linkedin:>6} linkedin-only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
