import type { Metadata } from "next";
import { Outfit } from 'next/font/google';
import "./globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import CookieConsent from "@/components/CookieConsent";
import BottomNav from '@/components/BottomNav'



// ONE FONT, SITEWIDE: Outfit. Nothing else is loaded (see CLAUDE.md §6). Old --font-* variables are aliased
// to Outfit in globals.css so legacy references can't bring another face back.
//
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



export const metadata: Metadata = {
  title: "x9Lab — Analytics for the fan",
  description: "Statcast, advanced metrics, and the data that explains tonight's game. Free daily email.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="antialiased">
        <GoogleAnalytics />
        {children}
        <BottomNav />
        <CookieConsent />
      </body>
    </html>
  );
}