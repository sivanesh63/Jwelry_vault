import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VaultProvider } from "@/lib/store";
import { LanguageProvider } from "@/lib/i18n";
import { AppShell } from "@/components/app-shell";

// No next/font here on purpose: webfonts are fetched at build time, and this
// project should build offline. globals.css falls back to the system UI stack,
// which is also what the PWA will feel most native in.

export const metadata: Metadata = {
  title: "Jewelry Vault",
  description: "Private family jewelry inventory, locker movements, and reminders.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Jewelry Vault",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#131211" },
  ],
  width: "device-width",
  initialScale: 1,
  // Zoom stays enabled: people will pinch into hallmark numbers and certificates.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <LanguageProvider>
          <VaultProvider>
            <AppShell>{children}</AppShell>
          </VaultProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
