import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VaultProvider } from "@/lib/store";
import { KeyVaultProvider } from "@/lib/keyvault";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/app-shell";
import { VaultGate } from "@/components/vault-gate";

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
  // PNG, not the SVG. iOS does not accept SVG for a home-screen icon and does
  // not read the manifest for one either — without an apple-touch-icon it
  // screenshots the page and uses that, which is how a carefully designed app
  // ends up with a blurry login form as its icon.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        <ThemeProvider>
          <LanguageProvider>
            {/*
              The gate sits outside AppShell, not inside it. Sign-in and unlock
              should not render navigation to screens that cannot load, and
              nothing below the gate ever has to ask whether the key is
              available — if it is rendering, the vault is open.
            */}
            <KeyVaultProvider>
              <VaultGate>
                <VaultProvider>
                  <AppShell>{children}</AppShell>
                </VaultProvider>
              </VaultGate>
            </KeyVaultProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
