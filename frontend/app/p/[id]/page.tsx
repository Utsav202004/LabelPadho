import type { Metadata } from "next";
import LabelPadhoApp from "../../LabelPadhoApp";
import { fetchAuditSummary } from "./audit";

// Shareable audit page: /p/123 opens that product's audit directly and gives
// WhatsApp / social previews a real title, verdict and image.
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const audit = await fetchAuditSummary(id);
  if (!audit) return { title: "LabelPadho - Food Label Truth Engine" };
  const title = `${audit.title} scores ${audit.score ?? "?"}/10 on LabelPadho`;
  return {
    title,
    description: audit.summary,
    openGraph: { title, description: audit.summary, type: "article" },
    twitter: { card: "summary_large_image", title, description: audit.summary },
  };
}

export default async function SharedAuditPage({ params }: Props) {
  const { id } = await params;
  const scanId = Number(id);
  return <LabelPadhoApp initialScanId={Number.isInteger(scanId) && scanId > 0 ? scanId : undefined} />;
}
