import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShellBrand, AppShellNav } from "@/components/app-shell-nav";
import { getAuthState } from "@/lib/auth/server";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Xplorab Shelfsense",
  description: "Panel de inteligencia de anaquel, jobs OCR y configuración semántica.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await getAuthState();

  return (
    <html lang="es" className={`${plusJakarta.variable} dark h-full`}>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <Providers auth={auth}>
          <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(53,127,199,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(17,184,166,0.18),transparent_38%),linear-gradient(180deg,#05080f_0%,#080d16_100%)]">
            <header className="sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur-xl">
              <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <AppShellBrand />
                  <AppShellNav />
                </div>
              </div>
            </header>
            <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
