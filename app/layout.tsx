import type { Metadata } from "next";
import { themeBootstrap } from "@/lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Peek",
  description: "Peek at everything you want to know.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AI Peek" },
  icons: {
    icon: { url: "/app-icon-64.png", sizes: "64x64", type: "image/png" },
    shortcut: "/app-icon-64.png",
    apple: { url: "/app-icon-180.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>{children}</body>
    </html>
  );
}
