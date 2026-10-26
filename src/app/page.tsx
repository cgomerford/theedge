// src/app/page.tsx
//
// Homepage. Server-rendered and cacheable for everyone: no cookies are read here. Top to bottom: header, featured scout
// report (the hero), ONE inline email ask, today's games strip, a plain link row, the shared footer (from the root layout).
// The email ask is swapped for a "Your follows" row by a small client island if the visitor is signed in
// (HomeAskOrFollows, which calls the private /api/me/follows), so the page HTML is identical for every visitor.

import type { Metadata } from 'next'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import FeaturedScout from '@/components/home/FeaturedScout'
import HomeEmailAsk from '@/components/home/HomeEmailAsk'
import HomeAskOrFollows from '@/components/home/HomeAskOrFollows'
import GamesStrip from '@/components/home/GamesStrip'
import HomeRail from '@/components/home/HomeRail'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { getFeaturedScout, getHomeSlate, getHomeStrip } from '@/lib/mlb-homepage'
import { canonical } from '@/lib/seo'

export const revalidate = 600

const TITLE = 'x9Lab: MLB game previews in plain numbers'
const DESCRIPTION =
  'Starting pitchers, bullpen workload and Statcast pitch data for every MLB game, in plain numbers with the sample size beside each stat. Free account.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: canonical('/') },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical('/') },
}

export default async function HomePage() {
  const slate = await getHomeSlate()
  const [featured, strip] = await Promise.all([getFeaturedScout(slate), getHomeStrip(slate)])

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <style>{`
        .hm-wrap{max-width:1360px;margin:0 auto;padding:0 16px 48px}
        .hm-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0 40px;align-items:start}
        .hm-main{min-width:0}
        .hm-figure{position:absolute;right:20px;top:0;width:230px;height:230px;pointer-events:none}
        .hm-figure img{position:absolute;right:0;bottom:0;width:230px;height:230px;object-fit:contain;object-position:bottom}
        .hm-figure-abbr{position:absolute;right:120px;top:10px;font-size:150px;font-weight:800;letter-spacing:-0.04em;line-height:1}
        .hm-hero-head{padding-right:210px;min-height:110px}
        .hm-hero > *:not(.hm-figure){position:relative}
        @media (max-width:640px){.hm-figure{width:104px;height:104px;right:10px}.hm-figure img{width:104px;height:104px}.hm-figure-abbr{font-size:64px;right:56px;top:6px}.hm-hero-head{padding-right:104px;min-height:96px}}
        .hm-rail{padding-top:20px}
        .hm-hero-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:20px 40px;align-items:start}
        .hm-tiles{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px 24px}
        .hm-mix{margin-top:8px}
        .hm-mixrow{display:grid;grid-template-columns:minmax(110px,1.3fr) 54px 74px minmax(76px,1fr) 88px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid #e7e2d8;font-size:13px}
        .hm-ask{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:12px 28px;align-items:center}
        .hm-links a{color:#1A1A1A;font-weight:700;text-decoration:underline;text-underline-offset:3px}
        @media (max-width:1100px){.hm-layout{grid-template-columns:minmax(0,1fr)}}
        @media (max-width:860px){.hm-hero-cols,.hm-ask{grid-template-columns:minmax(0,1fr)}}
        @media (max-width:480px){.hm-mixrow{grid-template-columns:minmax(0,1fr) 52px 70px;row-gap:2px}.hm-mixrow > :nth-child(4){grid-column:1 / 3}.hm-mixrow > :nth-child(5){grid-column:3;justify-self:end}}
      `}</style>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }]} />
      <SiteHeader variant="home" />

      <div className="hm-wrap">
        <div className="hm-layout">
          <div className="hm-main">
        {featured ? (
          <FeaturedScout data={featured} />
        ) : (
          <section style={{ padding: '32px 0 8px' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 800, letterSpacing: '-0.02em' }}>MLB game previews in plain numbers</h1>
          </section>
        )}

        <HomeAskOrFollows>
          <HomeEmailAsk />
        </HomeAskOrFollows>

        <GamesStrip strip={strip} />

        <p className="hm-links" style={{ margin: 0, padding: '14px 0', borderTop: '1px solid #e7e2d8', fontSize: 15 }}>
          <Link href="/how-it-works">How the numbers work</Link>
          {' · '}
          <Link href="/mlb/glossary">Glossary</Link>
          {' · '}
          <Link href="/how-it-works#sample-size">Sample-size minimums</Link>
        </p>
          </div>
          <HomeRail />
        </div>
      </div>
    </main>
  )
}
