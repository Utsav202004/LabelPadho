"""
"Label of the day" content engine.

Reads the live LabelPadho catalog, ranks products by how surprising their
report is (a "healthy" image vs what the label says), and writes a content
queue of fact sheets with tracked links. Claude (Cowork / chat) turns each
fact sheet into platform-specific posts; a human reviews before posting.

    python3 marketing/label_of_the_day.py --top 14
    → marketing/content/queue.json  (machine-readable, for automations)
    → marketing/content/queue.md    (human-readable, for review)

Standard library only, so it runs anywhere without installing anything.
"""

import argparse
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

API = "https://labelpadho.onrender.com"
SITE = "https://labelpadho.utsavgoyal.tech"
OUT = Path(__file__).resolve().parent / "content"

# Words that make people think a product is healthy: contrast with the label = good content
HEALTHY_IMAGE = ["protein", "oats", "muesli", "multigrain", "digestive", "whole wheat", "nutri", "fit", "lite",
                 "diet", "zero", "sugar free", "millet", "ragi", "baked", "fruit", "juice", "real", "natural",
                 "honey", "health", "energy", "yogurt", "lassi", "peanut butter", "granola", "coconut water"]
# Brands people instantly recognise get more engagement
FAMOUS = ["maggi", "parle", "britannia", "amul", "haldiram", "lay", "kurkure", "bingo", "cadbury", "kitkat", "nestle",
          "coca", "pepsi", "thums", "sprite", "maaza", "frooti", "kissan", "kellogg", "quaker", "saffola", "bournvita",
          "horlicks", "boost", "yoga bar", "dabur", "real", "paper boat", "sunfeast", "oreo", "balaji", "bikaji"]


def get(path: str, tries: int = 3):
    """GET JSON from the API, retrying: the free-tier backend can be slow to wake up."""
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(API + path, timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception:
            if attempt == tries - 1:
                return None
            time.sleep(3 * (attempt + 1))


def fetch_catalog() -> list[dict]:
    rows, offset = [], 0
    while True:
        page = get(f"/api/history?limit=100&offset={offset}") or []
        rows += page
        if len(page) < 100:
            return rows
        offset += 100


def title_of(e: dict) -> str:
    name, brand, variant = e.get("product_name") or "This product", e.get("brand"), e.get("variant")
    squash = lambda t: re.sub(r"[^a-z0-9]", "", (t or "").lower())
    if brand and not squash(name).startswith(squash(brand)):
        name = f"{brand} {name}"
    if variant and squash(variant) not in squash(name):
        name = f"{name} ({variant})"
    return name


def per100(a: dict) -> dict:
    e = a.get("extraction") or {}
    p100 = e.get("nutrition_per_100g") or {}
    if any(p100.get(k) is not None for k in ("sugar_g", "sodium_mg", "protein_g")):
        return p100
    s = e.get("nutrition_per_serving") or {}
    g = s.get("serving_size_g")
    return {k: (v * 100 / g if isinstance(v, (int, float)) and g else None) for k, v in s.items()}


def fact_sheet(a: dict) -> dict:
    e = a.get("extraction") or {}
    n = per100(a)
    title = title_of(e)
    claims = [c for c in a.get("claim_verifications") or [] if c.get("status") in ("misleading", "debunked")]
    hero = (a.get("ingredient_breakdown") or {}).get("hero_insight")
    negatives = [f["label"] for f in a.get("score_factors") or [] if f.get("points", 0) < 0][:3]
    flags = [f.get("title") for f in a.get("ingredient_flags") or [] if f.get("severity") in ("high", "medium")][:2]
    swaps = [f'{x.get("food_name")} ({x.get("quantity")})' for x in (a.get("natural_alternatives") or [])[:2]]
    return {
        "id": a.get("scan_id"),
        "title": title,
        "shelf": a.get("sub_category_display_name") or a.get("category_display_name"),
        "score": a.get("health_score"),
        "verdict": a.get("one_line_summary"),
        "why_score": negatives,
        "sugar_per_100g": round(n["sugar_g"], 1) if isinstance(n.get("sugar_g"), (int, float)) else None,
        "sodium_mg_per_100g": round(n["sodium_mg"]) if isinstance(n.get("sodium_mg"), (int, float)) else None,
        "protein_per_100g": round(n["protein_g"], 1) if isinstance(n.get("protein_g"), (int, float)) else None,
        "misleading_claims": [f'"{c.get("claim")}": {c.get("explanation")}' for c in claims][:2],
        "hero_ingredient_insight": hero,
        "ingredient_concerns": flags,
        "healthier_swaps": swaps,
        "data_source": a.get("data_source"),
    }


def fact_check(f: dict, report: dict) -> list[str]:
    """
    Reasons a fact sheet must NOT be turned into a post (empty list = OK).

    Posts name real brands, so a wrong number is a false public claim.
    Anything physically implausible or mis-filed is held back.
    """
    problems = []
    if (f["sodium_mg_per_100g"] or 0) > 39300:  # pure salt is 39.3% sodium
        problems.append("impossible sodium value")
    if (f["sugar_per_100g"] or 0) > 100:
        problems.append("impossible sugar value")
    e = report.get("extraction") or {}
    kcal = (e.get("nutrition_per_100g") or {}).get("energy_kcal")
    if report.get("product_category") in ("beverage_soda", "beverage_juice") and (kcal or 0) > 250:
        problems.append("drink powder/syrup filed as a ready drink")
    if f["score"] is None or not f["verdict"]:
        problems.append("incomplete report")
    return problems


def surprise_score(f: dict) -> float:
    """How likely this report is to make someone stop scrolling."""
    text = f"{f['title']} {f['shelf'] or ''}".lower()
    score = 0.0
    if any(w in text for w in HEALTHY_IMAGE):
        score += 3 * max(0, 7 - (f["score"] or 7)) / 7 + 1  # healthy image, poor score
    score += 2.5 * len(f["misleading_claims"])
    score += 2 if f["hero_ingredient_insight"] else 0
    score += 1.5 if (f["sugar_per_100g"] or 0) > 25 else 0
    score += 1.5 if (f["sodium_mg_per_100g"] or 0) > 800 else 0
    score += 2 if any(b in text for b in FAMOUS) else 0
    score += 1 if (f["score"] or 10) <= 3 else 0
    return round(score, 2)


def tracked(fid: int, source: str) -> str:
    return f"{SITE}/p/{fid}?utm_source={source}&utm_medium=social&utm_campaign=label_of_the_day"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=14, help="how many products to queue (14 = two weeks of daily posts)")
    args = ap.parse_args()

    catalog = fetch_catalog()
    get("/")  # wake the backend before the burst of requests
    with ThreadPoolExecutor(4) as pool:
        reports = list(pool.map(lambda r: get(f"/api/history/{r['id']}"), catalog))
    failed = sum(1 for r in reports if r is None)
    if failed:
        print(f"Skipped {failed} product(s) the API didn't return in time")

    sheets, held_back = [], []
    for a in reports:
        if not (a and a.get("scan_id")):
            continue
        sheet = fact_sheet(a)
        problems = fact_check(sheet, a)
        if problems:
            held_back.append(f"{sheet['title']}: {', '.join(problems)}")
            continue
        sheet["surprise_score"] = surprise_score(sheet)
        # Crowd-sourced data gets a human check against the real pack before posting
        sheet["verify_before_posting"] = (
            "Data from Open Food Facts (crowd-sourced): check the key numbers on the actual pack or its photo."
            if sheet["data_source"] == "open_food_facts" else "From a label photo scanned in LabelPadho."
        )
        sheets.append(sheet)
    # One product per brand, so the queue isn't five Balaji chips in a row
    picked, brands = [], set()
    for s in sorted(sheets, key=lambda s: s["surprise_score"], reverse=True):
        brand = s["title"].split()[0].lower()
        if brand in brands:
            continue
        brands.add(brand)
        s["links"] = {src: tracked(s["id"], src) for src in ("x", "linkedin", "instagram", "whatsapp")}
        picked.append(s)
        if len(picked) >= args.top:
            break

    OUT.mkdir(exist_ok=True)
    (OUT / "queue.json").write_text(json.dumps({"generated": str(date.today()), "catalog_size": len(catalog),
                                                "held_back": held_back, "queue": picked}, indent=2, ensure_ascii=False))
    lines = [f"# Content queue ({date.today()}): top {len(picked)} of {len(catalog)} products\n"]
    for i, s in enumerate(picked, 1):
        lines += [f"## {i}. {s['title']}: {s['score']}/10 ({s['shelf']})", f"- Verdict: {s['verdict']}"]
        lines += [f"- Why: {', '.join(s['why_score'])}"] if s["why_score"] else []
        lines += [f"- Claim: {c}" for c in s["misleading_claims"]]
        lines += [f"- Hero ingredient: {s['hero_ingredient_insight']}"] if s["hero_ingredient_insight"] else []
        fmt = lambda v, unit: f"{v}{unit}" if v is not None else "n/a"
        lines += [f"- Per 100g: sugar {fmt(s['sugar_per_100g'], 'g')}, sodium {fmt(s['sodium_mg_per_100g'], 'mg')}, "
                  f"protein {fmt(s['protein_per_100g'], 'g')}",
                  f"- Swaps: {', '.join(s['healthier_swaps']) or 'n/a'}",
                  f"- Check: {s['verify_before_posting']}", f"- Link (X): {s['links']['x']}", ""]
    if held_back:
        lines += ["## Held back by the fact-check gate", *[f"- {h}" for h in held_back], ""]
    (OUT / "queue.md").write_text("\n".join(lines))
    print(f"Queued {len(picked)} of {len(catalog)} products ({len(held_back)} held back) → {OUT}/queue.md")


if __name__ == "__main__":
    main()
