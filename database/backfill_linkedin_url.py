"""One-shot backfill of leads.linkedin_url from the source Google Sheet.

Walks the same tabs as sync_from_sheets.py, matches existing leads by email,
and fills `linkedin_url` only where it is currently NULL. Existing values are
left alone.
"""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sync_from_sheets import (  # noqa: E402
    TABS, COLUMN_ALIASES, SHEET_ID, SERVICE_ACCOUNT_FILE, SCOPES, LINKEDIN_MAX_LEN,
    build_header_map, cell, first_email, open_sheet,
)

BACKEND_DIR = HERE.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
from database import SessionLocal  # noqa: E402
from models import Lead  # noqa: E402


def main() -> int:
    sh = open_sheet()
    db = SessionLocal()
    grand_seen = grand_updated = grand_skipped_set = grand_no_match = 0
    per_tab: list[tuple[str, int, int, int, int]] = []

    try:
        # Map: email -> lead.id  for leads where linkedin_url IS NULL
        nullable = {
            email.lower(): lid
            for (lid, email) in db.query(Lead.id, Lead.email)
                                  .filter(Lead.linkedin_url.is_(None))
                                  .filter(Lead.email.isnot(None))
                                  .all()
            if email
        }
        print(f"Leads with NULL linkedin_url: {len(nullable)}")

        seen_in_run: set[str] = set()

        for title, _source in TABS:
            try:
                ws = sh.worksheet(title)
            except Exception:
                print(f"[skip] missing tab: {title}")
                continue

            print(f"\n>>> Reading: {title}")
            rows = ws.get_all_values()
            if not rows:
                continue
            headers, *data_rows = rows
            hmap = build_header_map(headers)
            if hmap["email"] is None or hmap["linkedin_url"] is None:
                print(f"   [skip] no email/linkedin column. headers={headers}")
                continue

            tab_seen = tab_updated = tab_no_link = tab_no_match = 0
            for row in data_rows:
                email = first_email(cell(row, hmap["email"]))
                if not email:
                    continue
                tab_seen += 1
                if email in seen_in_run:
                    continue
                seen_in_run.add(email)

                link = cell(row, hmap["linkedin_url"])
                if not link:
                    tab_no_link += 1
                    continue
                link = link[:LINKEDIN_MAX_LEN]

                lid = nullable.pop(email, None)
                if lid is None:
                    tab_no_match += 1
                    continue

                db.query(Lead).filter(Lead.id == lid).update(
                    {Lead.linkedin_url: link}, synchronize_session=False
                )
                tab_updated += 1

            db.commit()
            print(f"   seen={tab_seen} updated={tab_updated} no-link={tab_no_link} no-match-or-already-set={tab_no_match}")
            per_tab.append((title, tab_seen, tab_updated, tab_no_link, tab_no_match))
            grand_seen += tab_seen
            grand_updated += tab_updated
            grand_skipped_set += tab_no_link
            grand_no_match += tab_no_match
    finally:
        db.close()

    print("\n" + "=" * 64)
    print(f"{'tab':<22} {'seen':>8} {'updated':>9} {'no-link':>9} {'no-match':>10}")
    print("-" * 64)
    for t, s, u, nl, nm in per_tab:
        print(f"{t:<22} {s:>8} {u:>9} {nl:>9} {nm:>10}")
    print("-" * 64)
    print(f"{'TOTAL':<22} {grand_seen:>8} {grand_updated:>9} {grand_skipped_set:>9} {grand_no_match:>10}")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
