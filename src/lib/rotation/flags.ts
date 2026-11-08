// src/lib/rotation/flags.ts
//
// The Rotation Lab's rules, in one pure file (no database, no network) so every threshold is visible and tested.
// Input: one pitcher's appearances from rotation_apps. Output: a read of his last three starts set against his earlier ones.
//
// These are workload and velocity signals in public tracking data, not medical assessments. Each signal compares his last three starts with his earlier
// starts that season, so a pitcher who has always thrown 93 is not flagged for throwing 93. Nothing here is a forecast.
//
//   velo   primary fastball (four-seam, else sinker) average speed, last three starts vs earlier        watch -0.5 mph, flag -1.0 mph
//   late   speed lost between his first 25 and last 25 pitches of an outing (starts of 70+ pitches)     watch +0.8 mph wider than usual, flag +1.5
//   load   pitches per start over the last three                                                         watch avg 95+ or a 110+ start, flag avg 100+ or a 115+ start
//   rest   starts on 3 days' rest or fewer, among the last four                                         watch 1, flag 2+
//   slot   release height and arm angle on that fastball                                                 watch -0.15 ft or 3 degrees, flag -0.25 ft or 5 degrees
//   miss   called plus swinging strikes per pitch (results context; never changes the status)            watch -3 points, flag -5 points
//
// Status: Flagged = fastball speed down 1+ mph, or two or more signals fired with one of them red. Watch = anything else fired. Steady = nothing fired.
// Out = on the injured list. Too few starts = fewer than 4 starts, or fewer than 3 earlier ones to compare with.

export type FbBlock = { n: number; v: number | null; e: number | null; l: number | null; z: number | null; a: number | null }
export type App = {
  gamePk: number; date: string; team: string; opp: string | null; isStart: boolean
  pitches: number; bf: number; outs: number; k: number; bb: number; csw: number | null; fb: Record<string, FbBlock>
}
export type Info = { name: string; throws: string | null; team: string | null; ilCode: string | null; ilDesc: string | null }

export type Level = 'ok' | 'watch' | 'flag' | 'na'
export type SignalKey = 'velo' | 'late' | 'load' | 'rest' | 'slot' | 'miss'
export type Signal = { key: SignalKey; label: string; level: Level; value: string; detail: string }
export type Status = 'steady' | 'watch' | 'flagged' | 'out' | 'thin'

export type StartPoint = {
  date: string; opp: string | null; pitches: number; outs: number; k: number; bb: number; csw: number | null
  restDays: number | null; n: number; v: number | null; e: number | null; l: number | null; z: number | null; a: number | null
}

export type PitcherRead = {
  id: number; name: string; throws: string | null; team: string | null
  starts: number; outs: number; pitches: number; bf: number; k: number; bb: number
  lastDate: string | null; daysSince: number | null
  fbType: 'FF' | 'SI' | null; seasonVelo: number | null
  status: Status; ilDesc: string | null
  signals: Signal[]
  series: StartPoint[]
}

const DAY = 86400000
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)
export const inningsText = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`

/** Mean of `pick(x)` weighted by `w(x)`, ignoring rows where the value is missing. null when nothing has a value. */
export function wmean<T>(rows: T[], pick: (r: T) => number | null | undefined, w: (r: T) => number): { mean: number | null; weight: number } {
  let s = 0, t = 0
  for (const r of rows) { const v = pick(r); const x = w(r); if (v != null && Number.isFinite(v) && x > 0) { s += v * x; t += x } }
  return { mean: t > 0 ? s / t : null, weight: t }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const sgn = (x: number, nd = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(nd)}`

/** The fastball type he throws most over the given starts (four-seam or sinker). */
export function primaryFb(starts: App[]): 'FF' | 'SI' | null {
  let ff = 0, si = 0
  for (const a of starts) { ff += a.fb.FF?.n ?? 0; si += a.fb.SI?.n ?? 0 }
  if (ff === 0 && si === 0) return null
  return ff >= si ? 'FF' : 'SI'
}

function series(apps: App[], fb: 'FF' | 'SI' | null): StartPoint[] {
  const out: StartPoint[] = []
  apps.forEach((a, i) => {
    if (!a.isStart) return
    const b = fb ? a.fb[fb] : undefined
    out.push({
      date: a.date, opp: a.opp, pitches: a.pitches, outs: a.outs, k: a.k, bb: a.bb, csw: a.csw,
      restDays: i > 0 ? Math.max(0, daysBetween(apps[i - 1].date, a.date) - 1) : null, n: b?.n ?? 0,
      v: b?.v ?? null, e: b?.e ?? null, l: b?.l ?? null, z: b?.z ?? null, a: b?.a ?? null,
    })
  })
  return out
}

const NA = (key: SignalKey, label: string, why: string): Signal => ({ key, label, level: 'na', value: '—', detail: why })

export function signalsFor(recent: StartPoint[], base: StartPoint[], fbName: string): Signal[] {
  const out: Signal[] = []
  const w = (p: StartPoint) => p.n

  // velo
  {
    const r = wmean(recent, p => p.v, w), b = wmean(base, p => p.v, w)
    if (r.mean == null || b.mean == null || r.weight < 30 || b.weight < 100) out.push(NA('velo', 'Fastball speed', 'Too few fastballs to compare.'))
    else {
      const d = r.mean - b.mean
      const level: Level = d <= -1.0 ? 'flag' : d <= -0.5 ? 'watch' : 'ok'
      out.push({ key: 'velo', label: 'Fastball speed', level, value: `${sgn(d)} mph`, detail: `${fbName} ${r.mean.toFixed(1)} mph over his last three starts, ${b.mean.toFixed(1)} before that.` })
    }
  }

  // late (speed lost across an outing)
  {
    const drop = (p: StartPoint) => (p.pitches >= 70 && p.e != null && p.l != null ? p.e - p.l : null)
    const r = recent.map(drop).filter((x): x is number => x != null), b = base.map(drop).filter((x): x is number => x != null)
    if (r.length < 2 || b.length < 4) out.push(NA('late', 'Late-outing speed', 'Needs outings of 70+ pitches to compare.'))
    else {
      const rm = mean(r) as number, bm = mean(b) as number, gap = rm - bm
      const level: Level = gap >= 1.5 ? 'flag' : gap >= 0.8 ? 'watch' : 'ok'
      out.push({ key: 'late', label: 'Late-outing speed', level, value: `${rm.toFixed(1)} mph lost`, detail: `${fbName} speed lost between his first 25 and last 25 pitches: ${rm.toFixed(1)} mph lately, ${bm.toFixed(1)} mph before.` })
    }
  }

  // load
  {
    const pc = recent.map(p => p.pitches)
    if (pc.length < 3) out.push(NA('load', 'Pitch count', 'Fewer than three starts.'))
    else {
      const avg = mean(pc) as number, mx = Math.max(...pc)
      const level: Level = avg >= 100 || mx >= 115 ? 'flag' : avg >= 95 || mx >= 110 ? 'watch' : 'ok'
      out.push({ key: 'load', label: 'Pitch count', level, value: `${Math.round(avg)} avg`, detail: `${pc.join(', ')} pitches over his last three starts (highest ${mx}).` })
    }
  }

  // rest (computed over his last four starts, so the caller passes recent + one earlier)
  // handled by the caller through restSignal()

  // slot
  {
    const rz = wmean(recent, p => p.z, w), bz = wmean(base, p => p.z, w)
    const ra = wmean(recent, p => p.a, w), ba = wmean(base, p => p.a, w)
    if (rz.mean == null || bz.mean == null || rz.weight < 30 || bz.weight < 100) out.push(NA('slot', 'Release & arm slot', 'Too few fastballs to compare.'))
    else {
      const dz = rz.mean - bz.mean
      const da = ra.mean != null && ba.mean != null ? ra.mean - ba.mean : null
      const lz: Level = dz <= -0.25 ? 'flag' : dz <= -0.15 ? 'watch' : 'ok'
      const la: Level = da == null ? 'ok' : Math.abs(da) >= 5 ? 'flag' : Math.abs(da) >= 3 ? 'watch' : 'ok'
      const level: Level = lz === 'flag' || la === 'flag' ? 'flag' : lz === 'watch' || la === 'watch' ? 'watch' : 'ok'
      out.push({ key: 'slot', label: 'Release & arm slot', level, value: `${sgn(dz, 2)} ft${da != null ? ` · ${sgn(da)}°` : ''}`, detail: `Release height ${rz.mean.toFixed(2)} ft lately against ${bz.mean.toFixed(2)} ft before${da != null ? `; arm angle ${(ra.mean as number).toFixed(1)}° against ${(ba.mean as number).toFixed(1)}°` : ''}.` })
    }
  }

  // miss (context)
  {
    const r = wmean(recent, p => p.csw, p => p.pitches), b = wmean(base, p => p.csw, p => p.pitches)
    if (r.mean == null || b.mean == null) out.push(NA('miss', 'Strikes won', 'No pitch results to compare.'))
    else {
      const d = r.mean - b.mean
      const level: Level = d <= -5 ? 'flag' : d <= -3 ? 'watch' : 'ok'
      out.push({ key: 'miss', label: 'Strikes won', level, value: `${sgn(d)} pts`, detail: `Called plus swinging strikes per pitch: ${r.mean.toFixed(1)}% lately, ${b.mean.toFixed(1)}% before.` })
    }
  }
  return out
}

function restSignal(lastFour: StartPoint[]): Signal {
  const known = lastFour.filter(p => p.restDays != null)
  if (known.length < 3) return NA('rest', 'Rest between starts', 'Fewer than four starts.')
  const short = known.filter(p => (p.restDays as number) <= 3)
  const level: Level = short.length >= 2 ? 'flag' : short.length === 1 ? 'watch' : 'ok'
  const days = known.map(p => p.restDays).join(', ')
  return { key: 'rest', label: 'Rest between starts', level, value: short.length ? `${short.length} short` : 'normal', detail: `Days of rest before his last ${known.length} starts: ${days}. Short means 3 or fewer.` }
}

export function statusOf(signals: Signal[]): Exclude<Status, 'out' | 'thin'> {
  const phys = signals.filter(s => s.key !== 'miss')
  const fired = phys.filter(s => s.level === 'watch' || s.level === 'flag')
  const velo = phys.find(s => s.key === 'velo')
  if (velo?.level === 'flag') return 'flagged'
  if (fired.length >= 2 && fired.some(s => s.level === 'flag')) return 'flagged'
  return fired.length ? 'watch' : 'steady'
}

/** One pitcher's read. `apps` is every appearance of his this season, any club. `asOf` is the newest game date in the data. */
export function readPitcher(id: number, info: Info | undefined, rawApps: App[], asOf: string): PitcherRead {
  const apps = [...rawApps].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.gamePk - b.gamePk))
  const starts = apps.filter(a => a.isStart)
  const fb = primaryFb(starts)
  const pts = series(apps, fb)
  const recent = pts.slice(-3), base = pts.slice(0, -3)
  const last = apps[apps.length - 1]
  const tot = apps.reduce((t, a) => ({ outs: t.outs + a.outs, pitches: t.pitches + a.pitches, bf: t.bf + a.bf, k: t.k + a.k, bb: t.bb + a.bb }), { outs: 0, pitches: 0, bf: 0, k: 0, bb: 0 })
  const fbName = fb === 'SI' ? 'Sinker' : 'Four-seam'
  const seasonVelo = fb ? wmean(starts, a => a.fb[fb]?.v, a => a.fb[fb]?.n ?? 0).mean : null
  const thin = pts.length < 4 || base.length < 3
  let signals: Signal[] = []
  if (!thin) {
    const core = signalsFor(recent, base, fbName)
    const idx = core.findIndex(s => s.key === 'slot')
    signals = [...core.slice(0, 3), restSignal(pts.slice(-4)), ...core.slice(idx)]
  }
  const il = info?.ilCode ?? null
  const status: Status = il ? 'out' : thin ? 'thin' : statusOf(signals)
  return {
    id, name: info?.name ?? `Pitcher ${id}`, throws: info?.throws ?? null, team: info?.team ?? last?.team ?? null,
    starts: starts.length, ...tot, lastDate: last?.date ?? null, daysSince: last ? daysBetween(last.date, asOf) : null,
    fbType: fb, seasonVelo, status, ilDesc: il ? info?.ilDesc ?? 'Injured list' : null, signals, series: pts,
  }
}

export type TeamRotation = { team: string; rotation: PitcherRead[]; depth: PitcherRead[]; out: PitcherRead[] }

const RECENT_DAYS = 35

/** A club's five most-used starters over the 35 days to its last game, then up to four others with 3+ starts for it, then injured starters who made 5+. */
export function readTeam(team: string, byPlayer: Map<number, App[]>, info: Map<number, Info>, asOf: string): TeamRotation {
  let lastGame = ''
  const mine: { id: number; recent: number; total: number; last: string }[] = []
  for (const apps of byPlayer.values()) {
    for (const a of apps) if (a.team === team && a.date > lastGame) lastGame = a.date
  }
  if (!lastGame) return { team, rotation: [], depth: [], out: [] }
  for (const [id, apps] of byPlayer) {
    const st = apps.filter(a => a.isStart && a.team === team)
    if (!st.length) continue
    mine.push({ id, total: st.length, recent: st.filter(a => daysBetween(a.date, lastGame) <= RECENT_DAYS).length, last: st[st.length - 1].date })
  }
  const order = (x: typeof mine[number], y: typeof mine[number]) => y.recent - x.recent || y.total - x.total || (x.last < y.last ? 1 : -1)
  const ranked = [...mine].sort(order)
  const rot = ranked.filter(m => m.recent > 0).slice(0, 5)
  const rotIds = new Set(rot.map(m => m.id))
  const read = (id: number) => readPitcher(id, info.get(id), byPlayer.get(id) ?? [], asOf)
  const rest = ranked.filter(m => !rotIds.has(m.id))
  const out = rest.filter(m => m.total >= 5 && info.get(m.id)?.ilCode && info.get(m.id)?.team === team).slice(0, 4)
  const outIds = new Set(out.map(m => m.id))
  const depth = rest.filter(m => m.total >= 3 && !outIds.has(m.id)).slice(0, 4)
  return { team, rotation: rot.map(m => read(m.id)), depth: depth.map(m => read(m.id)), out: out.map(m => read(m.id)) }
}
