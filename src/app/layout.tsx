import type { Metadata } from "next";
import { Red_Hat_Display } from 'next/font/google';
import "./globals.css";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import CookieConsent from "@/components/CookieConsent";
import BottomNav from '@/components/BottomNav'
import SiteFooter from '@/components/SiteFooter'
import EmailSignupModal from '@/components/signup/EmailSignupModal'
import { SiteSchema } from '@/components/StructuredData'
import { SITE_NAME, SITE_URL } from '@/lib/site'



// ONE FONT, SITEWIDE: Red Hat. Nothing else is loaded (see CLAUDE.md §6). Old --font-* variables are aliased
// to Red Hat in globals.css so legacy references can't bring another face back.
//
// The site's actual brand typeface is Effra (licensed Monotype/Dalton Maag
// — not on Google Fonts). Red Hat is the free stand-in, chosen for shape
// similarity — this used to be loaded via a per-page <style>/@import
// scoped to just the homepage; promoted here to next/font so every page
// gets it with no extra network round-trip and no FOUC, and so it can
// become the sitewide default (--font-sans in globals.css) instead of
// Inter.
const redhat = Red_Hat_Display({
  subsets: ['latin'],
  variable: '--font-redhat',
  display: 'swap',
})



export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'x9Lab: MLB game previews in plain numbers', template: `%s · ${SITE_NAME}` },
  description: 'Free MLB game previews: starting pitchers, lineups, bullpens and Statcast pitch data in plain numbers, with the sample size shown. Free daily email.',
  openGraph: { siteName: SITE_NAME, type: 'website', url: SITE_URL },
  twitter: { card: 'summary_large_image' },
  // og:image comes from src/app/opengraph-image.tsx (our own image).
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={redhat.variable}>
      <body className="antialiased">
        <GoogleAnalytics />
        <SiteSchema />
        {children}
        <SiteFooter />
        <BottomNav />
        <EmailSignupModal />
        <CookieConsent />
      </body>
    </html>
  );
}