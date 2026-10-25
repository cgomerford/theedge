/**
 * Sitemap served at /sitemap.xml.
 *
 * Every URL is built from SITE_URL, has no query string, and uses the same slugs the routes use:
 *  - team pages use the short slugs in src/lib/teams.ts (/mlb/teams/yankees)
 *  - game pages use "-vs-" (/mlb/yankees-vs-red-sox-2026-09-27 style, via teamSlug())
 *  - players are /mlb/players/{id}
 * Left out on purpose: /login, /signup, /me, /lab, /account, /admin, /dev, /preferences, /maintenance.
 */

import type { MetadataRoute } from 'next'
import { isMaintenanceGated } from '@/lib/maintenance-gates'
import { createAdminClient } from '@/lib/supabase'
import { getTeamRoster, LEAGUE_BY_TEAM_ID } from '@/lib/lab'
import { teamSlug } from '@/lib/mlb'
import { MLB_TEAMS } from '@/lib/teams'
import { LABS_MENU } from '@/lib/nav/labsMenu'
import { getLatestArticles } from '@/lib/articles'
import { SITE_URL } from '@/lib/site'

export const revalidate = 86400 // 24h: the roster section makes 30 MLB API calls, rosters barely change day to day

type Entry = MetadataRoute.Sitemap[number]

const STATIC_PATHS: { path: string; changeFrequency: Entry['changeFrequency']; priority: number }[] = [
  { path: '/', changeFrequency: 'daily', priority: 1.0 },
  { path: '/mlb', changeFrequency: 'daily', priority: 0.9 },
  { path: '/mlb/scores', changeFrequency: 'daily', priority: 0.8 },
  { path: '/mlb/stats', changeFrequency: 'daily', priority: 0.8 },
  { path: '/mlb/glossary', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/articles', changeFrequency: 'daily', priority: 0.6 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/why-edge', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const url = (path: string) => `${SITE_URL}${path === '/' ? '' : path}`

  const staticPages: MetadataRoute.Sitemap = STATIC_PATHS.map(p => ({
    url: p.path === '/' ? `${SITE_URL}/` : url(p.path),
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  // Built labs only ("soon" labs are stub pages).
  const labPages: MetadataRoute.Sitemap = LABS_MENU.filter(l => l.status !== 'soon').map(l => ({
    url: url(l.href),
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const teamPages: MetadataRoute.Sitemap = MLB_TEAMS.map(t => ({
    url: url(`/mlb/teams/${t.slug}`),
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  // Games: today and the past 14 days.
  const gamePages: MetadataRoute.Sitemap = []
  try {
    const since = new Date(now)
    since.setDate(since.getDate() - 14)
    const { data, error } = await createAdminClient()
      .from('edge_predictions')
      .select('game_date, home_team, away_team')
      .gte('game_date', since.toISOString().split('T')[0])
      .order('game_date', { ascending: false })
      .range(0, 999)
    if (error) console.error('[sitemap] games Supabase error:', error.message)
    const seen = new Set<string>()
    for (const p of (data ?? []) as { game_date: string; home_team: string | null; away_team: string | null }[]) {
      if (!p.home_team || !p.away_team) continue
      const path = `/mlb/${teamSlug(p.away_team)}-vs-${teamSlug(p.home_team)}-${p.game_date}`
      if (seen.has(path)) continue
      seen.add(path)
      gamePages.push({ url: url(path), lastModified: new Date(p.game_date), changeFrequency: 'hourly', priority: 0.6 })
    }
  } catch (e) {
    console.error('[sitemap] game pages failed', e)
  }

  // Players: active rosters, one clean URL each.
  const playerPages: MetadataRoute.Sitemap = []
  try {
    const teamIds = Object.keys(LEAGUE_BY_TEAM_ID).map(Number)
    const rosters = await Promise.all(teamIds.map(id => getTeamRoster(id).catch(() => [])))
    const ids = new Set<number>()
    for (const r of rosters) for (const p of r) ids.add(p.id)
    for (const id of ids) playerPages.push({ url: url(`/mlb/players/${id}`), lastModified: now, changeFrequency: 'daily', priority: 0.5 })
  } catch (e) {
    console.error('[sitemap] player pages failed', e)
  }

  const articlePages: MetadataRoute.Sitemap = []
  try {
    for (const a of await getLatestArticles(200)) {
      articlePages.push({ url: url(`/articles/${a.slug}`), lastModified: new Date(a.updated_at ?? a.published_at ?? now), changeFrequency: 'monthly', priority: 0.5 })
    }
  } catch (e) {
    console.error('[sitemap] articles failed', e)
  }

  return [...staticPages, ...labPages, ...teamPages, ...gamePages, ...playerPages, ...articlePages].filter(
    e => !isMaintenanceGated(new URL(e.url).pathname),
  )
}
