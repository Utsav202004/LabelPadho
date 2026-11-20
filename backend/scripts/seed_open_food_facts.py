"""
Seed the catalog from Open Food Facts.

    cd backend && ../.venv/bin/python scripts/seed_open_food_facts.py --target 100

Writes to whatever DATABASE_URL points at (local SQLite if unset). In
production you can instead call POST /api/admin/seed-open-food-facts with
the X-Admin-Key header, which runs on the server with its own DATABASE_URL.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session  # noqa: E402

from app.core.db import engine, init_db  # noqa: E402
from app.services.seed import seed_from_open_food_facts  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=100)
    args = parser.parse_args()
    init_db()
    with Session(engine) as session:
        result = asyncio.run(seed_from_open_food_facts(session, target=args.target))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
