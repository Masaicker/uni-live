import type { Metadata, Viewport } from "next";
import { THEME_INIT_SCRIPT } from "@/lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "多看",
  description: "把喜欢的直播，放在一起。支持斗鱼、虎牙多画面观看。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
