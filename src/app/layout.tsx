import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeScript } from "@/components/ThemeToggle";
import { getSessionUser } from "@/lib/auth";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LeaveBase — Prismix Studios",
    template: "%s · LeaveBase",
  },
  description:
    "Leave management for Prismix Studios — apply, approve and track leave against the company leave policy.",
  manifest: "/manifest.webmanifest",
  icons: {
    // The browser tab / bookmark bar. Multiple sizes so it stays crisp from 16px favicons up to
    // the high-DPI display Chrome uses for pinned tabs.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS "Add to Home Screen" reads this specifically — it ignores the manifest icons.
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeedf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a14" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The signed-in employee's stored light/dark choice, applied to <html> on the server so it is
  // already correct on the very first paint — including on a browser they have never used before.
  // Taken from the session lookup that already happens — deliberately not a second query, since
  // every extra database round trip is felt on a page that renders on the server.
  let serverTheme: string | null = null;
  try {
    const session = await getSessionUser();
    if (session && session.themePreference !== "SYSTEM") serverTheme = session.themePreference;
  } catch {
    // Never let a preference lookup stop the page rendering.
  }

  const attr = serverTheme === "DARK" ? "dark" : serverTheme === "LIGHT" ? "light" : undefined;

  return (
    <html
      lang="en"
      className={jakarta.variable}
      data-theme={attr}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript serverTheme={serverTheme} />
      </head>
      <body>{children}</body>
    </html>
  );
}
