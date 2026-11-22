import type { MetadataRoute } from "next";

// Lists every product report so search engines can find them.
// Rebuilt at most once an hour; new products show up automatically.
export const revalidate = 3600;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://labelpadho.utsavgoyal.tech").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: "daily", priority: 1 }];
  try {
    for (let offset = 0; offset < 5000; offset += 100) {
      const res = await fetch(`${API_BASE}/api/history?limit=100&offset=${offset}`, { next: { revalidate: 3600 } });
      if (!res.ok) break;
      const page: { id: number; created_at: string }[] = await res.json();
      for (const p of page) {
        entries.push({ url: `${SITE_URL}/p/${p.id}`, lastModified: new Date(p.created_at), changeFrequency: "weekly", priority: 0.7 });
      }
      if (page.length < 100) break;
    }
  } catch {
    // Backend asleep or unreachable: still serve the home page entry
  }
  return entries;
}
