import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LabelPadho - Food Label & Nutrition Truth Engine",
  description: "Decode Indian packaged food labels, expose misleading marketing claims, and verify nutritional math.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
