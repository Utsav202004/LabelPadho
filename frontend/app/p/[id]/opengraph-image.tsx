import { ImageResponse } from "next/og";
import { fetchAuditSummary } from "./audit";

// The preview card WhatsApp / X / LinkedIn show when an audit link is shared.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "LabelPadho audit";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await fetchAuditSummary(id);
  const score = audit?.score ?? null;
  const color = score == null ? "#64748b" : score >= 7 ? "#059669" : score >= 4 ? "#d97706" : "#dc2626";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f8fafc", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#0f172a" }}>
          Label<span style={{ color: "#059669" }}>Padho</span>
          <span style={{ marginLeft: 16, fontSize: 24, fontWeight: 500, color: "#64748b", alignSelf: "center" }}>Read the label</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 240, height: 240, borderRadius: 32, background: "white", border: `8px solid ${color}` }}>
            <div style={{ display: "flex", fontSize: 120, fontWeight: 800, color, lineHeight: 1 }}>{score ?? "?"}</div>
            <div style={{ display: "flex", fontSize: 32, color: "#64748b" }}>/ 10</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 800, color: "#0f172a", lineHeight: 1.1 }}>{audit?.title ?? "Food label audit"}</div>
            {audit?.category && <div style={{ display: "flex", fontSize: 28, color: "#4f46e5", marginTop: 12 }}>{audit.category}</div>}
            {audit?.worst && (
              <div style={{ fontSize: 30, color: "#b91c1c", marginTop: 20, display: "flex" }}>Watch out: {audit.worst}</div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#475569", display: "flex" }}>{audit?.summary ?? "See what's really inside this pack."}</div>
      </div>
    ),
    size
  );
}
