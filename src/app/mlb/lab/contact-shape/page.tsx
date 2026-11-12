// src/app/mlb/lab/contact-shape/page.tsx
//
// Contact Shape: an isolated page (not yet in the Labs menu) for a hitter's batted balls by launch angle and exit velocity. Reads recorded fixtures only: no database, no external calls.
// A static route, so it wins over the /mlb/lab/[slug] "coming soon" stub. Public: nothing here is Pro-gated.

import type { Metadata } from 'next'
import XMark from '@/components/XMark'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import ContactShapeLab, { type InitialView } from '@/components/contact-shape/ContactShapeLab'
import { pageMeta } from '@/lib/seo'

export const metadata: Metadata = pageMeta({
  title: 'Contact Shape',
  description: 'Where a hitter’s batted balls land by launch angle and exit velocity, what that contact has produced, and how it compares with the league or another hitter.',
  path: '/mlb/lab/contact-shape',
})
export const dynamic = 'force-dynamic'

const int = (v: string | string[] | undefined): number | undefined => { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isInteger(n) && n > 0 ? n : undefined }

export default async function ContactShapePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const s = Array.isArray(q.s) ? q.s[0] : q.s, m = Array.isArray(q.m) ? q.m[0] : q.m
  const initial: InitialView = { h: int(q.h), c: int(q.c), s: s === '2025' || s === 'both' ? s : undefined, m: m === 'density' || m === 'diff' ? m : undefined }
  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3' }}>
      <SiteHeader variant="page" />
      <MLBSubNav />
      <div style={{ maxWidth: 1800, margin: '0 auto', padding: '22px 32px 100px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#B83A0E' }}><XMark /> MLB · LAB · CONTACT SHAPE</div>
        <h1 style={{ margin: '4px 0 6px', fontWeight: 800, fontSize: 'clamp(30px,5vw,48px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>Where does his contact land?</h1>
        <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 760, margin: '0 0 16px', lineHeight: 1.5 }}>
          Every batted ball has a speed off the bat and an angle. Put them on one map and you can see how hard a hitter hits the ball, at what angle, and what balls hit like that have produced. Hover the (i) beside any number to see what it means.
        </p>
        <ContactShapeLab initial={initial} />
      </div>
    </main>
  )
}
