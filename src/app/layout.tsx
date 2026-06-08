import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShellNav } from "@/components/app-shell-nav";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Xplora Pulse",
  description: "Panel para operar jobs OCR y configuraciones.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${spaceGrotesk.variable} dark h-full`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(53,127,199,0.25),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(17,184,166,0.18),transparent_38%),linear-gradient(180deg,#05080f_0%,#080d16_100%)]">
            <header className="sticky top-0 z-20 border-b border-white/10 bg-black/35 backdrop-blur-xl">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="font-heading text-lg font-semibold tracking-tight text-white">
                    Xplora Pulse
                  </p>
                  <p className="text-sm text-slate-300">
                    Multi-cuenta · Jobs · Semántica · Analytics
                  </p>
                </div>
                <AppShellNav />
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
