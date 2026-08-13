import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.APP_URL || "http://localhost:3017";
const DESC = "Job-hunt pipeline - find, score, tailor, apply, track";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: "Jobs", template: "%s · Jobs" },
  description: DESC,
  applicationName: "Jobs",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
    shortcut: ["/icon.png"],
  },
  appleWebApp: { capable: true, title: "Jobs", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "Jobs",
    title: "Jobs",
    description: DESC,
    url: "/jobs",
  },
  twitter: { card: "summary_large_image", title: "Jobs", description: DESC },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
