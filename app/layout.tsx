import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import LoadingBar from "./components/LoadingBar";
import { Toaster } from "@/components/ui/toaster";
import { absoluteUrl, getSiteUrl, SITE_DESCRIPTION, SITE_NAME, siteVerification } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title: process.env.APP_NAME?.trim() || SITE_NAME,
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    icons: { icon: "/favicon.ico", apple: "/images/logo-nav.png" },
    openGraph: {
      siteName: SITE_NAME, locale: "zh_CN", type: "website",
      images: [{ url: absoluteUrl("/images/hero-hd.webp"), alt: SITE_NAME }],
    },
    twitter: { card: "summary_large_image", images: [absoluteUrl("/images/hero-hd.webp")] },
    verification: siteVerification(),
  };
}

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LoadingBar />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
