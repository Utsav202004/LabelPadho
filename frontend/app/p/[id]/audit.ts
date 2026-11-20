// Server-side helper to read a saved audit for link previews.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type AuditSummary = {
  title: string;
  score: number | null;
  summary: string;
  category: string | null;
  worst: string | null; // biggest negative score factor, for the preview image
};

export async function fetchAuditSummary(id: string): Promise<AuditSummary | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`${API_BASE}/api/history/${id}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const a = await res.json();
    const e = a.extraction || {};
    const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
    let title: string = e.product_name || "Packaged food";
    if (e.brand && !squash(title).startsWith(squash(String(e.brand)))) title = `${e.brand} ${title}`;
    if (e.variant && !squash(title).includes(squash(String(e.variant)))) title = `${title} (${e.variant})`;
    const worst = (a.score_factors || []).find((f: { points: number }) => f.points < 0)?.label ?? null;
    return {
      title,
      score: a.health_score ?? null,
      summary: a.one_line_summary || "See what's really inside this pack.",
      category: a.sub_category_display_name || a.category_display_name || null,
      worst,
    };
  } catch {
    return null;
  }
}
