// src/app/admin/calendar/page.tsx
//
// Content calendar: what is planned for each day (articles, X posts, graphics, videos, emails), what actually went out, and a roadmap report that says
// whether the week is on pace. Real published articles appear on their day by themselves. Auth: src/proxy.ts guards every /admin path.

import Link from 'next/link'
import { addDays, entriesFor, etDay, isDay, monthGrid, roadmap } from '@/lib/content-plan-core'
import { getTargets, listLinkableArticles, listPlan, listPublishedArticles, sourceActivity } from '@/lib/content-plan'
import { tokensReady } from '@/lib/content-ingest-auth'
import { SITE_URL } from '@/lib/site'
import CalendarBoard from './CalendarBoard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Content calendar - x9Lab', robots: { index: false, follow: false } }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const sp = await searchParams
  const now = new Date()
  const today = etDay(now)
  const ym = /^\d{4}-\d{2}$/.test(sp.m ?? '') && isDay(`${sp.m}-01`) ? (sp.m as string) : today.slice(0, 7)
  const grid = monthGrid(ym)
  const first = grid[0][0].day, last = grid[grid.length - 1][6].day
  // the report looks back five weeks and forward a week, wherever the month on screen is
  const from = [first, addDays(today, -40)].sort()[0], to = [last, addDays(today, 10)].sort().reverse()[0]
  const [plan, articles, linkable, targets, activity] = await Promise.all([listPlan(from, to), listPublishedArticles(from, to), listLinkableArticles(), getTargets(), sourceActivity()])
  const ready = tokensReady()
  const assistants = (['mlb_analysis', 'x', 'youtube'] as const).map(source => ({ source, enabled: ready[source], count: activity.by[source]?.count ?? 0, last: activity.by[source]?.last ?? null }))
  const entries = entriesFor(plan.items, [...articles, ...linkable.filter(a => !articles.some(x => x.id === a.id))], now)
  const report = roadmap(entries, targets, today)
  const selected = isDay(sp.d) ? sp.d : today.slice(0, 7) === ym ? today : `${ym}-01`

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px 20px 60px', fontFamily: 'var(--font-redhat), system-ui, sans-serif', color: '#1A1A1A' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        <Link href="/admin" style={{ color: '#5B5347', fontSize: 14, textDecoration: 'none' }}>← Admin</Link>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>Content calendar</h1>
      </div>
      <p style={{ margin: '0 0 18px', color: '#5B5347', fontSize: 14, maxWidth: 820, lineHeight: 1.5 }}>
        Plan each day&apos;s articles and posts, mark them published as they go out, and see whether the week is on pace. Articles you publish on the site appear on their day automatically.
      </p>
      <CalendarBoard ym={ym} today={today} selected={selected} grid={grid} entries={entries} report={report} targets={targets} linkable={linkable} missing={plan.missing} assistants={assistants} siteUrl={SITE_URL} columnsReady={!activity.missing} />
    </div>
  )
}
