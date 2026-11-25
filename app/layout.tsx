import type { Metadata } from "next";
import { themeBootstrap } from "@/lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI爽窥",
  description: "偷窥你想知道的一切",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AI爽窥" },
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>{children}</body>
    </html>
  );
}
