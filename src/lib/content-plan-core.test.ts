import { describe, it, expect } from 'vitest'
import { assistantInstructions, cleanAgentItem, cleanItem, cleanTargets, repeatDays, DEFAULT_TARGETS, addDays, daysBetween, effectiveStatus, entriesFor, etDay, isDay, monthGrid, roadmap, shiftMonth, weekStart, type ArticleRef, type Entry, type PlanItem } from './content-plan-core'

const item = (o: Partial<PlanItem>): PlanItem => ({ id: 'i' + Math.random(), plan_date: '2026-11-05', kind: 'article', title: 't', notes: '', status: 'planned', article_id: null, url: '', brief: '', source: 'george', external_key: null, assets: [], ...o })
const NOW = new Date('2026-11-05T15:00:00Z')

describe('dates', () => {
  it('works in whole days and Monday weeks', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28'); expect(daysBetween('2026-11-01', '2026-11-05')).toBe(4)
    expect(weekStart('2026-11-05')).toBe('2026-11-02'); expect(weekStart('2026-11-01')).toBe('2026-10-26'); expect(weekStart('2026-11-02')).toBe('2026-11-02')
    expect(isDay('2026-02-30')).toBe(false); expect(isDay('nope')).toBe(false); expect(isDay('2026-11-05')).toBe(true)
    expect(etDay('2026-11-06T02:30:00Z')).toBe('2026-11-05')
  })
  it('lays a month out as full Monday-first weeks', () => {
    const g = monthGrid('2026-11')
    expect(g[0][0].day).toBe('2026-10-26'); expect(g[0][6].day).toBe('2026-11-01'); expect(g[0][6].inMonth).toBe(true); expect(g[0][0].inMonth).toBe(false)
    expect(g.at(-1)![6].day).toBe('2026-12-06'); expect(g.every(w => w.length === 7)).toBe(true)
    expect(monthGrid('2026-12').flat().filter(d => d.inMonth).length).toBe(31); expect(monthGrid('2026-02').flat().filter(d => d.inMonth).length).toBe(28)
    expect(shiftMonth('2026-12', 1)).toBe('2027-01'); expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('what a day holds', () => {
  const art = (o: Partial<ArticleRef>): ArticleRef => ({ id: 'a1', title: 'A', status: 'published', published_at: '2026-11-04T14:00:00Z', ...o })
  it('turns a linked article into the plan item\'s status', () => {
    expect(effectiveStatus(item({ article_id: 'a1' }), art({}), NOW)).toBe('published')
    expect(effectiveStatus(item({ article_id: 'a1' }), art({ published_at: '2026-11-09T14:00:00Z' }), NOW)).toBe('scheduled')
    expect(effectiveStatus(item({ article_id: 'a1' }), art({ status: 'draft', published_at: null }), NOW)).toBe('drafted')
    expect(effectiveStatus(item({ article_id: 'a1', status: 'skipped' }), art({}), NOW)).toBe('skipped'); expect(effectiveStatus(item({}), undefined, NOW)).toBe('planned')
  })
  it('shows real articles on their day without repeating one a plan item already links to', () => {
    const e = entriesFor([item({ article_id: 'a1', plan_date: '2026-11-04' })], [art({}), art({ id: 'a2', title: 'B', published_at: '2026-11-03T14:00:00Z' }), art({ id: 'a3', status: 'draft', published_at: null })], NOW)
    expect(e.map(x => [x.day, x.title, x.source])).toEqual([['2026-11-03', 'B', 'article'], ['2026-11-04', 't', 'plan']])
  })
})

describe('roadmap report', () => {
  const E = (day: string, kind: Entry['kind'], status: Entry['status']): Entry => ({ key: day + kind + status + Math.random(), day, kind, title: 'x', status, source: 'plan' })
  const T = { ...DEFAULT_TARGETS, article: 3, x_post: 0 }
  it('is on track with the target met or planned', () => {
    const r = roadmap([E('2026-11-02', 'article', 'published'), E('2026-11-05', 'article', 'planned'), E('2026-11-06', 'article', 'planned'), E('2026-11-05', 'x_post', 'published')], T, '2026-11-05')
    expect(r.kinds.find(k => k.kind === 'article')).toMatchObject({ done: 1, upcoming: 2, target: 3, verdict: 'on track' })
    expect(r.weekStart).toBe('2026-11-02'); expect(r.weekEnd).toBe('2026-11-08')
  })
  it('is behind when the week cannot reach the target, and lists overdue items', () => {
    const r = roadmap([E('2026-11-03', 'article', 'planned')], T, '2026-11-05')
    expect(r.kinds.find(k => k.kind === 'article')!.verdict).toBe('behind'); expect(r.verdict).toBe('Behind'); expect(r.overdue).toHaveLength(1)
  })
  it('says watch when targets are fine but days are empty or items are overdue', () => {
    const none = roadmap([], { ...DEFAULT_TARGETS, article: 0, x_post: 0 }, '2026-11-05')
    expect(none.verdict).toBe('Watch'); expect(none.gaps).toHaveLength(7)
    expect(roadmap([E('2026-11-05', 'article', 'published'), ...[6, 7, 8, 9, 10, 11].map(d => E(`2026-11-${String(d).padStart(2, '0')}`, 'other', 'planned'))], { ...DEFAULT_TARGETS, article: 0, x_post: 0 }, '2026-11-05').verdict).toBe('On track')
  })
  it('counts a streak of published days and ignores skipped ones', () => {
    const r = roadmap([E('2026-11-05', 'x_post', 'published'), E('2026-11-04', 'article', 'published'), E('2026-11-03', 'x_post', 'published'), E('2026-11-02', 'x_post', 'skipped')], DEFAULT_TARGETS, '2026-11-05')
    expect(r.streak).toBe(3)
    expect(roadmap([E('2026-11-04', 'x_post', 'published')], DEFAULT_TARGETS, '2026-11-05').streak).toBe(1)
  })
  it('keeps five weeks of history', () => {
    const r = roadmap([E('2026-10-27', 'article', 'published'), E('2026-11-03', 'article', 'published')], DEFAULT_TARGETS, '2026-11-05')
    expect(r.weeks).toHaveLength(5); expect(r.weeks[3].weekStart).toBe('2026-10-26'); expect(r.weeks[3].done.article).toBe(1); expect(r.weeks[4].done.article).toBe(1)
  })
})

describe('what the form may send', () => {
  it('cleans an item and refuses one with no date or title', () => {
    expect(cleanItem({ plan_date: '2026-11-05', title: '  Brewers   recap ', kind: 'article', status: 'drafted', url: 'javascript:alert(1)', article_id: 'nope' })).toEqual({ plan_date: '2026-11-05', title: 'Brewers recap', kind: 'article', status: 'drafted', notes: '', article_id: null, url: '', brief: '', source: 'george', external_key: null })
    expect(cleanItem({ plan_date: '2026-11-05', title: 'x', kind: 'bogus', status: 'bogus', url: '/articles/a', article_id: '123e4567-e89b-12d3-a456-426614174000' })).toMatchObject({ kind: 'other', status: 'planned', url: '/articles/a', article_id: '123e4567-e89b-12d3-a456-426614174000' })
    expect(cleanItem({ plan_date: '2026-02-30', title: 'x' })).toBeNull(); expect(cleanItem({ plan_date: '2026-11-05', title: '   ' })).toBeNull(); expect(cleanItem(null)).toBeNull()
    expect(cleanItem({ plan_date: '2026-11-05', title: 'x'.repeat(500) })!.title).toHaveLength(200)
  })
  it('keeps targets to whole numbers 0 to 50', () => {
    expect(cleanTargets({ article: 4, x_post: -1, graphic: 2.5, video: 99, email: '3' })).toEqual({ ...DEFAULT_TARGETS, article: 4, email: 3 }); expect(cleanTargets(null)).toEqual(DEFAULT_TARGETS)
  })
  it('lists the days a repeating item lands on', () => {
    expect(repeatDays('2026-11-05', 'none', 9)).toEqual(['2026-11-05']); expect(repeatDays('2026-11-05', 'day', 3)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
    expect(repeatDays('2026-11-05', 'week', 2)).toEqual(['2026-11-05', '2026-11-12']); expect(repeatDays('2026-11-05', 'day', 999)).toHaveLength(60)
  })
})

describe('briefs, sources and assistant uploads', () => {
  const base = { plan_date: '2026-11-08', title: 'Scouting video', kind: 'video' }
  it('keeps a brief (cut to 50,000 characters) and a clean external key; a bad key becomes null', () => {
    expect(cleanItem({ ...base, brief: ' Hook.\r\nLine two ', external_key: 'yt-2026-11-08_a.1' })).toMatchObject({ brief: 'Hook.\nLine two', external_key: 'yt-2026-11-08_a.1' })
    expect(cleanItem({ ...base, brief: 'x'.repeat(60_000) })!.brief).toHaveLength(50_000)
    for (const bad of ['', ' lead', '-lead', 'has space', 'a'.repeat(81), 'semi;colon', 5]) expect(cleanItem({ ...base, external_key: bad })!.external_key).toBeNull()
  })
  it('knows only the four sources, and never takes images from a body', () => {
    expect(cleanItem({ ...base, source: 'youtube' })!.source).toBe('youtube'); expect(cleanItem({ ...base, source: 'admin' })!.source).toBe('george')
    expect('assets' in cleanItem({ ...base, assets: [{ path: 'x' }] })!).toBe(false)
  })
  it('forces an assistant\'s source and keeps it to planned or drafted', () => {
    expect(cleanAgentItem({ ...base, source: 'x', status: 'published' }, 'youtube')).toMatchObject({ source: 'youtube', status: 'planned' })
    expect(cleanAgentItem({ ...base, status: 'scheduled' }, 'x')!.status).toBe('planned'); expect(cleanAgentItem({ ...base, status: 'skipped' }, 'x')!.status).toBe('planned')
    expect(cleanAgentItem({ ...base, status: 'drafted' }, 'x')!.status).toBe('drafted')
    expect(cleanAgentItem({ ...base, article_id: '123e4567-e89b-12d3-a456-426614174000' }, 'mlb_analysis')!.article_id).toBeNull()
    expect(cleanAgentItem({ plan_date: 'bad', title: 'x' }, 'x')).toBeNull()
  })
})

describe('assistant instructions', () => {
  it('give the endpoint, the rules and the right kind for each assistant, and no token', () => {
    for (const [src, kind] of [['mlb_analysis', 'article'], ['x', 'x_post'], ['youtube', 'video']] as const) {
      const t = assistantInstructions(src, 'https://xlab9.com/')
      expect(t).toContain('https://xlab9.com/api/admin/content-plan/ingest'); expect(t).toContain('/assets'); expect(t).toContain(`"kind": "${kind}"`)
      expect(t).toContain('"planned" or "drafted"'); expect(t).toContain('locked'); expect(t).toContain('<YOUR TOKEN>'); expect(t).not.toMatch(/Bearer [A-Za-z0-9]{20,}/)
      expect(t).not.toMatch(/\b(will win|lock of|guarantee|bet on)\b/i)
    }
  })
})
