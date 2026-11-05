// src/lib/content-plan-core.ts
//
// The content calendar's logic, with no database or screen in it: days and weeks (Monday to Sunday, in Eastern time), what a day holds, and the roadmap
// report that says whether the plan is on pace. Used by the admin calendar page (src/app/admin/calendar) and its tests.

export type Kind = 'article' | 'x_post' | 'graphic' | 'video' | 'email' | 'other'
export type Status = 'planned' | 'drafted' | 'scheduled' | 'published' | 'skipped'
export const KINDS: { id: Kind; label: string; plural: string; color: string }[] = [
  { id: 'article', label: 'Article', plural: 'Articles', color: '#FF5722' }, { id: 'x_post', label: 'X post', plural: 'X posts', color: '#1A1A1A' },
  { id: 'graphic', label: 'Graphic', plural: 'Graphics', color: '#1D9E75' }, { id: 'video', label: 'Video', plural: 'Videos', color: '#3B82C4' },
  { id: 'email', label: 'Email', plural: 'Emails', color: '#8A5FBF' }, { id: 'other', label: 'Other', plural: 'Other', color: '#8A8275' },
]
export const STATUSES: { id: Status; label: string }[] = [
  { id: 'planned', label: 'Planned' }, { id: 'drafted', label: 'Drafted' }, { id: 'scheduled', label: 'Scheduled' }, { id: 'published', label: 'Published' }, { id: 'skipped', label: 'Skipped' },
]
export const OPEN: Status[] = ['planned', 'drafted', 'scheduled']
export const kindOf = (k: string) => KINDS.find(x => x.id === k) ?? KINDS[5]

export type PlanItem = { id: string; plan_date: string; kind: Kind; title: string; notes: string; status: Status; article_id: string | null; url: string }
export type ArticleRef = { id: string; title: string; slug?: string; status: 'draft' | 'published'; published_at: string | null; updated_at?: string }
export type Targets = Record<Kind, number>
// Only articles start with a target: nothing records X posts or graphics until they are planned here, so a target for them would read as behind from day one.
export const DEFAULT_TARGETS: Targets = { article: 3, x_post: 0, graphic: 0, video: 0, email: 0, other: 0 }

// ── Dates (all plain YYYY-MM-DD strings; Monday is the first day of the week) ─────────────

const DAY = 86_400_000
const ms = (d: string) => Date.parse(`${d}T12:00:00Z`)
export const isDay = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(ms(d)) && new Date(ms(d)).toISOString().slice(0, 10) === d
export const addDays = (d: string, n: number) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10)
/** The day an ISO timestamp falls on in Eastern time. */
export const etDay = (iso: string | Date) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
/** Monday of the week a day is in. */
export const weekStart = (d: string) => { const dow = (new Date(ms(d)).getUTCDay() + 6) % 7; return addDays(d, -dow) }
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY)

/** A month as full weeks of 7 days (Monday first), each day tagged with whether it is in the month. */
export function monthGrid(ym: string): { day: string; inMonth: boolean }[][] {
  const first = `${ym}-01`
  if (!isDay(first)) return []
  const last = addDays(`${shiftMonth(ym, 1)}-01`, -1)
  const weeks: { day: string; inMonth: boolean }[][] = []
  for (let w = weekStart(first); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => { const day = addDays(w, i); return { day, inMonth: day.slice(0, 7) === ym } }))
  return weeks
}
export const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }

// ── What a day holds ──────────────────────────────────────────────────────────────────────

export type Entry = { key: string; day: string; kind: Kind; title: string; status: Status; source: 'plan' | 'article'; itemId?: string; articleId?: string | null; notes?: string; url?: string; /** where the piece lives, for a link */ href?: string }

/** A plan item's status once its linked article is taken into account: a published article means published, an unpublished one means at least drafted. */
export function effectiveStatus(item: PlanItem, article: ArticleRef | undefined, now: Date): Status {
  if (item.status === 'skipped') return 'skipped'
  if (!article) return item.status
  if (article.status === 'published' && article.published_at) return new Date(article.published_at) <= now ? 'published' : 'scheduled'
  return item.status === 'planned' ? 'drafted' : item.status
}

/** Every entry for a range: the plan items, plus each real article that is published (or scheduled) on a day and is not already linked from a plan item. */
export function entriesFor(items: PlanItem[], articles: ArticleRef[], now: Date): Entry[] {
  const byId = new Map(articles.map(a => [a.id, a]))
  const linked = new Set(items.map(i => i.article_id).filter((x): x is string => !!x))
  const out: Entry[] = items.map(i => ({ key: `p${i.id}`, day: i.plan_date, kind: i.kind, title: i.title, status: effectiveStatus(i, i.article_id ? byId.get(i.article_id) : undefined, now), source: 'plan', itemId: i.id, articleId: i.article_id, notes: i.notes, url: i.url, href: i.url || (i.article_id && byId.get(i.article_id)?.slug ? `/articles/${byId.get(i.article_id)!.slug}` : undefined) }))
  for (const a of articles) {
    if (linked.has(a.id) || a.status !== 'published' || !a.published_at) continue
    out.push({ key: `a${a.id}`, day: etDay(a.published_at), kind: 'article', title: a.title, status: new Date(a.published_at) <= now ? 'published' : 'scheduled', source: 'article', articleId: a.id, href: a.slug ? `/articles/${a.slug}` : undefined })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
}

// ── The roadmap report ────────────────────────────────────────────────────────────────────

export type KindProgress = { kind: Kind; label: string; target: number; done: number; upcoming: number; expected: number; verdict: 'done' | 'on track' | 'behind' | 'no target' }
export type WeekRow = { weekStart: string; done: Record<Kind, number> }
export type Roadmap = {
  today: string; weekStart: string; weekEnd: string; verdict: 'On track' | 'Watch' | 'Behind'; reasons: string[]
  kinds: KindProgress[]; overdue: Entry[]; gaps: string[]; streak: number; weeks: WeekRow[]
}
const zeroKinds = (): Record<Kind, number> => ({ article: 0, x_post: 0, graphic: 0, video: 0, email: 0, other: 0 })

/** Whether the plan is on pace this week, from the entries, the weekly targets and today's date. Counts only what is published; planned items count as upcoming. */
export function roadmap(entries: Entry[], targets: Targets, today: string): Roadmap {
  const ws = weekStart(today), we = addDays(ws, 6)
  const elapsed = daysBetween(ws, today) + 1
  const inWeek = (e: Entry, from: string) => e.day >= from && e.day <= addDays(from, 6)
  const kinds: KindProgress[] = KINDS.map(k => {
    const target = targets[k.id] ?? 0
    const mine = entries.filter(e => e.kind === k.id && inWeek(e, ws))
    const done = mine.filter(e => e.status === 'published').length
    const upcoming = mine.filter(e => OPEN.includes(e.status) && e.day >= today).length
    const expected = Math.floor((target * elapsed) / 7 + 1e-9)
    const verdict: KindProgress['verdict'] = target <= 0 ? 'no target' : done >= target ? 'done' : done + upcoming >= target && done >= expected ? 'on track' : 'behind'
    return { kind: k.id, label: k.plural, target, done, upcoming, expected, verdict }
  })
  const overdue = entries.filter(e => e.day < today && OPEN.includes(e.status))
  const gaps = Array.from({ length: 7 }, (_, i) => addDays(today, i)).filter(d => !entries.some(e => e.day === d && e.status !== 'skipped'))
  let streak = 0
  for (let d = entries.some(e => e.day === today && e.status === 'published') ? today : addDays(today, -1); entries.some(e => e.day === d && e.status === 'published'); d = addDays(d, -1)) streak++
  const weeks: WeekRow[] = Array.from({ length: 5 }, (_, i) => addDays(ws, -7 * (4 - i))).map(w => {
    const done = zeroKinds()
    for (const e of entries) if (inWeek(e, w) && e.status === 'published') done[e.kind]++
    return { weekStart: w, done }
  })
  const reasons: string[] = []
  for (const k of kinds) {
    if (k.verdict === 'behind') reasons.push(`${k.label}: ${k.done} of ${k.target} published this week${k.upcoming ? `, ${k.upcoming} still planned` : ', none planned'}. About ${k.expected} should be out by now.`)
    else if (k.verdict === 'done') reasons.push(`${k.label}: ${k.done} of ${k.target}, target met.`)
    else if (k.verdict === 'on track') reasons.push(`${k.label}: ${k.done} of ${k.target} published, ${k.upcoming} planned for the rest of the week.`)
  }
  if (overdue.length) reasons.push(`${overdue.length} planned item${overdue.length > 1 ? 's' : ''} from earlier days ${overdue.length > 1 ? 'are' : 'is'} not marked published or skipped.`)
  if (gaps.length >= 3) reasons.push(`${gaps.length} of the next 7 days have nothing planned.`)
  const verdict: Roadmap['verdict'] = kinds.some(k => k.verdict === 'behind') ? 'Behind' : overdue.length > 0 || gaps.length >= 3 ? 'Watch' : 'On track'
  return { today, weekStart: ws, weekEnd: we, verdict, reasons, kinds, overdue, gaps, streak, weeks }
}

// ── What the admin form may send (everything is checked here before it reaches the database) ──

export type NewItem = Omit<PlanItem, 'id'>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A clean plan item, or null when the date or title is unusable. Unknown kinds and statuses fall back to Other / Planned; links must be http(s) or a site path. */
export function cleanItem(x: unknown): NewItem | null {
  const o = (typeof x === 'object' && x ? x : {}) as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
  if (!isDay(o.plan_date) || !title) return null
  const url = typeof o.url === 'string' ? o.url.trim().slice(0, 500) : ''
  return {
    plan_date: o.plan_date, title, kind: KINDS.some(k => k.id === o.kind) ? (o.kind as Kind) : 'other', status: STATUSES.some(s => s.id === o.status) ? (o.status as Status) : 'planned',
    notes: typeof o.notes === 'string' ? o.notes.slice(0, 2000) : '', article_id: typeof o.article_id === 'string' && UUID.test(o.article_id) ? o.article_id : null,
    url: /^(https?:\/\/|\/)/.test(url) ? url : '',
  }
}
/** Weekly targets: whole numbers from 0 to 50 for every kind; anything else becomes the default. */
export function cleanTargets(x: unknown): Targets {
  const o = (typeof x === 'object' && x ? x : {}) as Record<string, unknown>
  const out = { ...DEFAULT_TARGETS }
  for (const k of KINDS) { const n = Number(o[k.id]); if (Number.isInteger(n) && n >= 0 && n <= 50) out[k.id] = n }
  return out
}
/** The dates a repeating item lands on: every day or every week, up to 60 copies, starting on `from`. */
export function repeatDays(from: string, every: 'none' | 'day' | 'week', count: number): string[] {
  const n = every === 'none' ? 1 : Math.max(1, Math.min(60, Math.floor(count) || 1))
  return Array.from({ length: n }, (_, i) => addDays(from, i * (every === 'week' ? 7 : 1)))
}
