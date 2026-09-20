import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono, Bebas_Neue, Outfit } from 'next/font/google';
import "./globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import CookieConsent from "@/components/CookieConsent";
import BottomNav from '@/components/BottomNav'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// The site's actual brand typeface is Effra (licensed Monotype/Dalton Maag
// — not on Google Fonts). Outfit is the free stand-in, chosen for shape
// similarity — this used to be loaded via a per-page <style>/@import
// scoped to just the homepage; promoted here to next/font so every page
// gets it with no extra network round-trip and no FOUC, and so it can
// become the sitewide default (--font-sans in globals.css) instead of
// Inter.
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

const bebas = Bebas_Neue({
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
  weight: '400',
})

export const metadata: Metadata = {
  title: "The Edge — Pre-game brief for the analytics era",
  description: "Statcast, advanced metrics, and the data that explains tonight's game. Free daily email.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable} ${bebas.variable} ${outfit.variable}`}>
      <body className={`${inter.variable} ${jetbrains.variable} ${fraunces.variable} ${outfit.variable} antialiased`}>
        <GoogleAnalytics />
        {children}
        <BottomNav />
        <CookieConsent />
      </body>
    </html>
  );
}