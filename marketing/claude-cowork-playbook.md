# LabelPadho growth playbook: Claude + connectors

How LabelPadho is marketed with AI as a **system**: the product's own data feeds the content, Claude drafts and analyses, connectors move work between tools, and a human approves anything public.

**Ground rules:** no fake accounts, fake reviews or spam. Every public post and email is reviewed and sent by me. Use official tools and follow each community's self-promotion rules. Say I'm the maker.

---

## The loop

```
Live catalog (210+ scored products)
   │  label_of_the_day.py: picks the most surprising reports
   ▼
Content queue (fact sheets + tracked links)
   │  Claude: writes X / LinkedIn / Instagram / WhatsApp / Hindi versions
   ▼
Review doc (Google Docs / Notion via connector) ── I approve ──► I post
   │                                                          │
   ▼                                                          ▼
Tracked links (utm_source=x / linkedin / whatsapp …) ──► visits, searches, scans, shares
   │                                                          │
   ▼                                                          ▼
growth_report.py → /api/admin/stats ──► Claude: "what worked, 3 experiments for next week"
   │
   └─► "searches with no results" → products to scan/seed next → more content
```

---

## Workflow 1: "Label of the day" (daily, ~10 min of my time)

**Automated part:** `python3 marketing/label_of_the_day.py --top 14` refreshes `marketing/content/queue.json` from the live catalog.

**Claude task** (Cowork scheduled task, daily 8:00, or paste into Claude):
> Read `marketing/content/queue.json`. Take the next product that isn't in `marketing/content/posted.md`. Using **only the facts in its fact sheet** (never invent numbers), write:
> 1. an X post (≤ 270 chars, hook first, one number, the link for `x`),
> 2. a LinkedIn post (5–7 short lines, curious and helpful, not preachy, link for `linkedin`),
> 3. an Instagram carousel outline (5 slides: hook, the claim, what the label says, why it matters, a healthier swap),
> 4. a WhatsApp status line, in Hinglish.
> Tone: a friend who reads labels, not a doctor. No emojis except at most one. End with "Check yours: labelpadho.utsavgoyal.tech".
> Save them to the Google Doc "LabelPadho – content review" under today's date.

**Connectors:** Google Drive/Docs (review doc), optionally Notion (content calendar).
**Human step:** I read it, fix anything off, post it, and add the product to `posted.md`.

## Workflow 2: Weekly growth report (Mondays, ~15 min)

**Automated part:** `ADMIN_KEY=… python3 marketing/growth_report.py --days 7` writes `marketing/reports/growth-<date>.md` from first-party analytics (visitors by source, engaged %, products checked, top reports, searches with no results, shares by channel).

**Claude task:**
> Read the latest file in `marketing/reports/`. Compare with last week's. Tell me in 5 bullets what changed and why it might have, which channel brought the most **engaged** visitors (not just visits), and propose 3 experiments for this week, ranked by ICE (impact, confidence, ease). Add the "searches with no results" to `marketing/content/to-scan.md`. Post a 5-line summary to Slack #growth (or email it to me).

**Connectors:** Slack or Gmail (summary), Google Drive (report archive).

## Workflow 3: Creator & community outreach (2×/week, ~30 min)

**Claude task:**
> Find 15 Indian micro-creators (5k–100k followers) and dietitians who post about packaged food, label reading, fitness nutrition or kids' food. For each, note name, platform, profile link, follower range, and one recent topic. Add them to the Google Sheet "LabelPadho outreach" (columns: name, platform, link, niche, recent topic, product angle, status). For each, pick the **one LabelPadho report most relevant to their niche** from `queue.json`, and draft a short, personal email or DM: who I am, the specific finding, the free tool, no ask beyond "thought you'd find this useful, happy to add products your audience asks about". Save drafts in Gmail as **drafts only**.

**Connectors:** web search, Google Sheets (tracker), Gmail (drafts only; I send).
**Also:** college food/fitness clubs, gym WhatsApp groups, parenting groups: a short Hinglish message with one striking report link.

## Workflow 4: Listening & helpful answers (weekly)

**Claude task:**
> Search Reddit (r/india, r/IndianFood, r/Fitness_India, r/bangalore …) and Quora for recent questions like "is X healthy", "best protein snack India", "how much sugar in Y". List the 10 most relevant threads with links. For each, draft a genuinely helpful answer that stands on its own, and mention the LabelPadho report only where it directly answers the question, disclosing that I built it. Put it in the review doc.

**Human step:** I post only where the community rules allow it, from my own account.

## Workflow 5: Repurpose winners

**Claude task:**
> From this week's growth report, take the top 3 most-viewed reports. Turn them into: a "3 snacks that aren't what they seem" LinkedIn carousel outline, an X thread, and a short Hindi script for a 30-second reel (hook in the first 2 seconds, one number, one swap).

---

## Measuring it

- **North-star metric:** products checked per week (searches + reports opened + barcode lookups + scans).
- **Per channel:** visitors → engaged % → shares, using `utm_source` on every link.
- **Viral loop:** visits from shared links (`utm_medium=share`) per share.
- **Content quality:** which "surprise" types (misleading claim / hero ingredient / sugar / salt) bring the most engaged visitors → feed back into `surprise_score` weights.

## SEO (runs on its own)

Every product report is a page at `/p/<id>`, rendered on the server with the title "Is <product> healthy? <score>/10", listed in `/sitemap.xml`. Next step: submit the sitemap in Google Search Console and track impressions for "is <brand> healthy" searches.
