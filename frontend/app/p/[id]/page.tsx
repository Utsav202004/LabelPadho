import type { Metadata } from "next";
import LabelPadhoApp from "../../LabelPadhoApp";
import { fetchAudit, fetchAuditSummary, SITE_URL } from "./audit";

// Shareable report page: /p/123 opens that product's report directly.
// The report is fetched on the server, so the HTML already contains it:
// Google can index it ("is Maggi healthy?") and link previews get real text.
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const audit = await fetchAuditSummary(id);
  if (!audit) return { title: "LabelPadho - Read the label" };
  // Match how people search: "Is <product> healthy?"
  const title = `Is ${audit.title} healthy? ${audit.score ?? "?"}/10 on LabelPadho`;
  const description = `${audit.summary} See ingredients, sugar, salt, claims checked and healthier swaps.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/p/${id}` },
    openGraph: { title, description, type: "article", url: `${SITE_URL}/p/${id}`, siteName: "LabelPadho" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedAuditPage({ params }: Props) {
  const { id } = await params;
  const scanId = Number(id);
  const valid = Number.isInteger(scanId) && scanId > 0;
  const initialAnalysis = valid ? await fetchAudit(id) : null;
  return <LabelPadhoApp initialScanId={valid ? scanId : undefined} initialAnalysis={initialAnalysis} />;
}
