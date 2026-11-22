import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://labelpadho.utsavgoyal.tech").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "LabelPadho - Is your packaged food really healthy?",
  description:
    "Check any Indian packaged food in seconds: hidden sugar and salt, misleading claims, a health score with reasons, and healthier swaps. Search, scan a barcode or snap the label. Free.",
  openGraph: {
    title: "LabelPadho - Read the label",
    description: "Is your packaged food really healthy? Check 200+ Indian products or scan your own label. Free.",
    url: SITE_URL,
    siteName: "LabelPadho",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
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
