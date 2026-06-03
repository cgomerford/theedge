/**
 * src/app/sitemap.ts
 *
 * Next.js native sitemap generator. Auto-creates /sitemap.xml at the root.
 *
 * Generates URLs for:
 *  - All static pages (homepage, fantasy hub, deep pages, etc.)
 *  - All 30 MLB team pages
 *  - All game preview pages for today
 *  - All game preview pages from the past 14 days (still relevant for backlinks)
 *
 * Re-runs on each request (cached for `revalidate` seconds).
 * After deploying, submit https://edgereportdaily.com/sitemap.xml to
 * Google Search Console.
 */

import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase'

const BASE_URL = 'https://edgereportdaily.com'

// All 30 MLB team slugs
const MLB_TEAMS = [
  'arizona-diamondbacks', 'atlanta-braves', 'baltimore-orioles', 'boston-red-sox',
  'chicago-cubs', 'chicago-white-sox', 'cincinnati-reds', 'cleveland-guardians',
  'colorado-rockies', 'detroit-tigers', 'houston-astros', 'kansas-city-royals',
  'los-angeles-angels', 'los-angeles-dodgers', 'miami-marlins', 'milwaukee-brewers',
  'minnesota-twins', 'new-york-mets', 'new-york-yankees', 'athletics',
  'philadelphia-phillies', 'pittsburgh-pirates', 'san-diego-padres',
  'san-francisco-giants', 'seattle-mariners', 'st-louis-cardinals',
  'tampa-bay-rays', 'texas-rangers', 'toronto-blue-jays', 'washington-nationals',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // ── 1. Static pages ────────────────────────────────────────────────────────
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`,                   lastModified: now, changeFrequency: 'daily',  priority: 1.0 },
    { url: `${BASE_URL}/tonight`,            lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/mlb`,                lastModified: now, changeFrequency: 'daily',  priority: 0.9 },
    { url: `${BASE_URL}/fantasy`,            lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/fantasy/streamers`,  lastModified: now, changeFrequency: 'daily',  priority: 0.8 },
    { url: `${BASE_URL}/fantasy/platforms`,  lastModified: now, changeFrequency: 'daily',  priority: 0.8 },
    { url: `${BASE_URL}/fantasy/two-start`,  lastModified: now, changeFrequency: 'daily',  priority: 0.8 },
    { url: `${BASE_URL}/fantasy/news`,       lastModified: now, changeFrequency: 'hourly', priority: 0.7 },
    { url: `${BASE_URL}/track-record`,       lastModified: now, changeFrequency: 'daily',  priority: 0.7 },
    { url: `${BASE_URL}/about`,              lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/pricing`,            lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/faq`,                lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/privacy`,            lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE_URL}/terms`,              lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ]

  // ── 2. MLB team pages ──────────────────────────────────────────────────────
  const teamPages: MetadataRoute.Sitemap = MLB_TEAMS.map(slug => ({
    url: `${BASE_URL}/mlb/teams/${slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  // ── 3. Game preview pages (today + past 14 days for backlink retention) ───
  let gamePages: MetadataRoute.Sitemap = []
  try {
    const supa = createAdminClient()
    const fourteenDaysAgo = new Date(now)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    const { data: predictions } = await supa
      .from('edge_predictions')
      .select('game_pk, game_date, home_team, away_team')
      .gte('game_date', fourteenDaysAgo.toISOString().split('T')[0])
      .order('game_date', { ascending: false })

    if (predictions) {
      for (const p of predictions) {
        const awaySlug = (p.away_team ?? '').toLowerCase().replace(/\s+/g, '-').replace(/\./g, '')
        const homeSlug = (p.home_team ?? '').toLowerCase().replace(/\s+/g, '-').replace(/\./g, '')
        if (!awaySlug || !homeSlug) continue
        gamePages.push({
          url: `${BASE_URL}/mlb/${awaySlug}-at-${homeSlug}-${p.game_date}`,
          lastModified: new Date(p.game_date),
          changeFrequency: 'hourly',
          priority: 0.6,
        })
      }
    }
  } catch (e) {
    console.error('sitemap: game pages query failed', e)
  }

  return [...staticPages, ...teamPages, ...gamePages]
}
