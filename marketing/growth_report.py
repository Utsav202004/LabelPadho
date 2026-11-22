"""
Weekly growth report from LabelPadho's own analytics.

    ADMIN_KEY=... python3 marketing/growth_report.py --days 7
    → marketing/reports/growth-YYYY-MM-DD.md

The numbers come from GET /api/admin/stats (anonymous first-party events).
Paste the report into Claude to get 3 suggested experiments for next week,
or let a scheduled Claude task do it (see claude-cowork-playbook.md).
"""

import argparse
import json
import os
import urllib.request
from datetime import date
from pathlib import Path

API = "https://labelpadho.onrender.com"
OUT = Path(__file__).resolve().parent / "reports"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    key = os.environ.get("ADMIN_KEY")
    if not key:
        raise SystemExit("Set ADMIN_KEY in your environment (the same value as on Render).")

    req = urllib.request.Request(f"{API}/api/admin/stats?days={args.days}", headers={"X-Admin-Key": key})
    with urllib.request.urlopen(req, timeout=90) as r:
        s = json.loads(r.read().decode())

    engaged_pct = round(100 * s["engaged_visitors"] / s["visitors"]) if s["visitors"] else 0
    table = lambda d: "\n".join(f"| {k} | {v} |" for k, v in d.items()) or "| (none yet) | |"
    report = f"""# LabelPadho growth report: last {s['period_days']} days ({date.today()})

## Headline
- **Visitors:** {s['visitors']}  ·  **Engaged** (searched, opened a report, scanned): {s['engaged_visitors']} ({engaged_pct}%)
- **Products checked:** {s['products_checked']}  ·  **New products added:** {s['new_products_added']}  ·  **Catalog:** {s['catalog_size']}
- **Shares:** {sum(s['shares_by_channel'].values())}

## Where visitors came from
| Source | Visitors |
|---|---|
{table(s['traffic_sources'])}

## Most-viewed reports
| Product | Views |
|---|---|
{chr(10).join(f"| {p['name']} | {p['views']} |" for p in s['top_products_viewed']) or "| (none yet) | |"}

## What people searched for
| Search | Count |
|---|---|
{table(s['top_searches'])}

## Searches with no results (→ products to add next)
| Search | Count |
|---|---|
{table(s['searches_with_no_results'])}

## Shares by channel
| Channel | Shares |
|---|---|
{table(s['shares_by_channel'])}

## All events
| Event | Count |
|---|---|
{table(s['events'])}
"""
    OUT.mkdir(exist_ok=True)
    path = OUT / f"growth-{date.today()}.md"
    path.write_text(report)
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
