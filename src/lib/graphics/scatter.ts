// src/lib/graphics/scatter.ts
//
// Pure logic for the admin scatter chart builder (/admin/scatter): one dot per player, two stats, a few highlighted and labelled.
// Nothing here fetches or draws. The data comes from src/lib/scatter-data.ts (public Savant leaderboards) and from columns the editor pastes in.

export type ScatterRow = { id: number | null; name: string; team?: string; v: Record<string, number | null>; /** text columns: team, league, position, pitch name... */ c: Record<string, string> }
export type ScatterColumn = { key: string; label: string; decimals: number }
export type CatColumn = { key: string; label: string }
export type ScatterDataset = { id: string; label: string; columns: ScatterColumn[]; cats: CatColumn[]; rows: ScatterRow[] }

// ── Names ─────────────────────────────────────────────────────────────────────────────────

/** "Crow-Armstrong, Pete" -> "Pete Crow-Armstrong"; other names are only trimmed. */
export function displayName(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  const m = t.match(/^([^,]+),\s*(.+)$/)
  return m ? `${m[2]} ${m[1]}`.trim() : t
}

/** The key two spellings of one player share: accents, case, punctuation, hyphens and Jr/Sr/II/III are ignored, and "Last, First" is flipped. */
export function nameKey(raw: string): string {
  return displayName(raw)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Pasted columns (for example DRS from another site) ────────────────────────────────────

export type PastedColumn = { key: string; label: string; values: Map<string, number> }
export type PasteResult = { columns: PastedColumn[]; names: number; error?: string }

const toNum = (s: string): number | null => {
  const t = s.trim().replace(/^\+/, '').replace(/[−–]/g, '-').replace(/%$/, '')
  if (t === '' || t === '-' || t === '—') return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

function splitLine(line: string, d: string): string[] {
  if (d === '\t') return line.split('\t').map(c => c.trim())
  const out: string[] = []; let cur = ''; let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Header row first. The name column is the one headed Name or Player (else the first); every other column with numbers becomes a choosable stat. Tab or comma separated (a paste from a web table or a spreadsheet is tabs). */
export function parsePasted(text: string, keyPrefix = 'p'): PasteResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) return { columns: [], names: 0, error: 'Paste a header row and at least one player.' }
  const d = lines[0].includes('\t') ? '\t' : ','
  const head = splitLine(lines[0], d).map(h => h.replace(/^"|"$/g, ''))
  if (head.length < 2) return { columns: [], names: 0, error: 'Needs a name column and at least one number column.' }
  const body = lines.slice(1).map(l => splitLine(l, d))
  const found = head.findIndex(h => /^(name|player|player name|playername)$/i.test(h.trim()))
  const nc = found >= 0 ? found : 0
  const columns: PastedColumn[] = []
  for (let c = 0; c < head.length; c++) {
    if (c === nc) continue
    const values = new Map<string, number>()
    for (const r of body) { const v = toNum(r[c] ?? ''); const k = nameKey(r[nc] ?? ''); if (v != null && k && !values.has(k)) values.set(k, v) }
    if (values.size > 0 && values.size >= body.length * 0.3) columns.push({ key: `${keyPrefix}${c}`, label: head[c] || `Column ${c + 1}`, values })
  }
  if (!columns.length) return { columns: [], names: 0, error: 'No column with numbers was found. Put the player name first.' }
  return { columns, names: new Set(body.map(r => nameKey(r[nc] ?? '')).filter(Boolean)).size }
}

/** Joins a pasted column onto the dataset by name. Names in the paste that match nobody are returned so the editor can see them. */
export function mergeColumn(ds: ScatterDataset, col: PastedColumn): { dataset: ScatterDataset; matched: number; unmatched: string[] } {
  const have = new Set<string>()
  const rows = ds.rows.map(r => {
    const k = nameKey(r.name)
    const v = col.values.get(k)
    if (v != null) have.add(k)
    return { ...r, v: { ...r.v, [col.key]: v ?? null } }
  })
  const unmatched = [...col.values.keys()].filter(k => !have.has(k))
  const vals = [...col.values.values()]
  const decimals = vals.every(Number.isInteger) ? 0 : decimalsFor(vals)
  return { dataset: { ...ds, columns: [...ds.columns.filter(c => c.key !== col.key), { key: col.key, label: col.label, decimals }], rows }, matched: have.size, unmatched }
}

/** Joins another table's stats onto this one by player name, so a chart can set a stat from one table against a stat from another (DRS against xwOBA, say).
 *  Columns arrive as `<id>__<key>`, labelled `<tag>: <label>`. Players missing from the other table get null. Returns how many players matched. */
export function joinDataset(base: ScatterDataset, other: ScatterDataset, tag: string): { dataset: ScatterDataset; matched: number } {
  const by = new Map<string, ScatterRow>()
  for (const r of other.rows) { const k = nameKey(r.name); if (k && !by.has(k)) by.set(k, r) }
  let matched = 0
  const key = (k: string) => `${other.id}__${k}`
  const rows = base.rows.map(r => {
    const o = by.get(nameKey(r.name))
    if (o) matched++
    const v = { ...r.v }
    for (const c of other.columns) v[key(c.key)] = o ? o.v[c.key] ?? null : null
    return { ...r, v }
  })
  const have = new Set(base.columns.map(c => c.key))
  const cols = other.columns.filter(c => !have.has(key(c.key))).map(c => ({ key: key(c.key), label: `${tag}: ${c.label}`, decimals: c.decimals }))
  return { dataset: { ...base, columns: [...base.columns, ...cols], rows }, matched }
}

/** Decimal places for a stat: whole numbers none, under 2 three places (.254), under 10 two, otherwise one. */
export function decimalsFor(values: number[]): number {
  const v = values.filter(Number.isFinite)
  if (!v.length) return 0
  if (v.every(Number.isInteger)) return 0
  const m = Math.max(...v.map(Math.abs))
  return m < 2 ? 3 : m < 10 ? 2 : 1
}

// ── Numbers on the chart ──────────────────────────────────────────────────────────────────

/** 26.3 -> "+26.3", -4.7 -> "−4.7" (a true minus sign), 0 -> "0" when signed; plain otherwise. Rates under 1 drop the leading zero (.254). */
export function fmt(v: number, decimals: number, signed: boolean): string {
  let t = Math.abs(v).toFixed(decimals)
  if (Math.abs(v) < 1 && decimals > 0 && !signed) t = t.replace(/^0/, '')
  if (Number(t) === 0) return signed ? '0' : t
  return `${v < 0 ? '−' : signed ? '+' : ''}${t}`
}

/** Round axis ticks covering [min, max]: steps of 1, 2, 5 times a power of ten. */
export function niceTicks(min: number, max: number, target = 6): { ticks: number[]; lo: number; hi: number } {
  if (!(max > min)) { const c = Number.isFinite(min) ? min : 0; return { ticks: [c - 1, c, c + 1], lo: c - 1, hi: c + 1 } }
  const raw = (max - min) / Math.max(2, target)
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step)
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] }
}

// ── Which dots get a name ─────────────────────────────────────────────────────────────────

export type Point = { name: string; x: number; y: number }
export type HighlightMode = 'gap' | 'top-y' | 'bottom-y' | 'top-x' | 'bottom-x' | 'none'

/** The n players to name automatically: furthest from the y = x line, or the highest/lowest on one axis. */
export function autoHighlights(points: Point[], mode: HighlightMode, n: number): Point[] {
  if (mode === 'none' || n <= 0) return []
  const by: Record<Exclude<HighlightMode, 'none'>, (a: Point, b: Point) => number> = {
    gap: (a, b) => Math.abs(b.y - b.x) - Math.abs(a.y - a.x),
    'top-y': (a, b) => b.y - a.y, 'bottom-y': (a, b) => a.y - b.y, 'top-x': (a, b) => b.x - a.x, 'bottom-x': (a, b) => a.x - b.x,
  }
  return [...points].sort(by[mode]).slice(0, n)
}

/** Automatic picks plus the names typed in, once each, in the order they should be drawn. Typed names that match nobody come back as `missing`. */
export function pickHighlights(points: Point[], mode: HighlightMode, n: number, manual: string[], off: string[] = []): { picked: Point[]; missing: string[] } {
  const byKey = new Map(points.map(p => [nameKey(p.name), p]))
  const picked: Point[] = []; const seen = new Set<string>(); const missing: string[] = []
  const skip = new Set(off.map(nameKey))
  // Names the editor clicked off are skipped, and the next-best player takes the place, so "top 12" stays 12.
  for (const p of autoHighlights(points, mode, n + skip.size)) { const k = nameKey(p.name); if (skip.has(k) || seen.has(k) || picked.length >= n) continue; seen.add(k); picked.push(p) }
  for (const m of manual) {
    const k = nameKey(m); if (!k) continue
    const p = byKey.get(k)
    if (!p) { missing.push(m); continue }
    if (!seen.has(k)) { seen.add(k); picked.push(p) }
  }
  return { picked, missing }
}

// ── Label placement ───────────────────────────────────────────────────────────────────────

export type LabelIn = { px: number; py: number; text: string }
export type LabelOut = { x: number; y: number; anchor: 'start' | 'end'; w: number; h: number }
type Box = { x0: number; y0: number; x1: number; y1: number }

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/** Puts each label beside its dot (right, left, above, below, in that order of preference) where it does not cover another label, a highlighted dot or leave the plot. First come, first placed. */
export function layoutLabels(items: LabelIn[], bounds: { x0: number; y0: number; x1: number; y1: number }, fontSize: number, dotR = 7, charW = 0.64): LabelOut[] {
  const h = fontSize * 1.15
  const placed: Box[] = []
  const dots: Box[] = items.map(i => ({ x0: i.px - dotR, y0: i.py - dotR, x1: i.px + dotR, y1: i.py + dotR }))
  return items.map((it, idx) => {
    const w = it.text.length * fontSize * charW
    const g = dotR + 4
    const cands: { x: number; y: number; anchor: 'start' | 'end' }[] = []
    // Beside the dot first, then stepping up and down, then further out; right side before left at each step.
    for (const far of [0, 18, 46]) for (const k of [0, -0.9, 0.9, -1.8, 1.8, -2.7, 2.7]) {
      cands.push({ x: it.px + g + far, y: it.py + k * h, anchor: 'start' }, { x: it.px - g - far, y: it.py + k * h, anchor: 'end' })
    }
    cands.push({ x: it.px - w / 2, y: it.py - dotR - h * 0.6, anchor: 'start' }, { x: it.px - w / 2, y: it.py + dotR + h * 0.9, anchor: 'start' })
    const boxOf = (c: { x: number; y: number; anchor: 'start' | 'end' }): Box => {
      const x0 = c.anchor === 'start' ? c.x : c.x - w
      return { x0, y0: c.y - h * 0.78, x1: x0 + w, y1: c.y + h * 0.28 }
    }
    const inside = (b: Box) => b.x0 >= bounds.x0 && b.x1 <= bounds.x1 && b.y0 >= bounds.y0 && b.y1 <= bounds.y1
    const clash = (b: Box) => placed.some(p => overlap(b, p)) || dots.some((d, i) => i !== idx && overlap(b, d))
    let best = cands.find(c => { const b = boxOf(c); return inside(b) && !clash(b) })
    if (!best) {
      // Nothing fits cleanly: take the candidate that stays inside and covers the least, else the first.
      const score = (c: typeof cands[number]) => { const b = boxOf(c); return (inside(b) ? 0 : 1000) + placed.filter(p => overlap(b, p)).length * 10 + dots.filter((d, i) => i !== idx && overlap(b, d)).length }
      best = [...cands].sort((a, b) => score(a) - score(b))[0]
    }
    placed.push(boxOf(best))
    return { x: best.x, y: best.y, anchor: best.anchor, w, h }
  })
}

// ── Checks the editor shows before export ─────────────────────────────────────────────────

export type Spec = { title: string; subtitle: string; xKey: string; yKey: string; points: number; missing: string[]; unmatched: string[] }
export function checkScatter(s: Spec): string[] {
  const w: string[] = []
  if (!s.title.trim()) w.push('Write a headline.')
  if (!s.xKey || !s.yKey) w.push('Choose both stats.')
  else if (s.xKey === s.yKey) w.push('Both axes use the same stat.')
  if (s.points < 10) w.push(`Only ${s.points} players are plotted. A scatter needs a real sample.`)
  if (s.missing.length) w.push(`Not found in this data: ${s.missing.join(', ')}.`)
  if (s.unmatched.length) w.push(`${s.unmatched.length} pasted name${s.unmatched.length > 1 ? 's' : ''} matched nobody (${s.unmatched.slice(0, 4).join(', ')}${s.unmatched.length > 4 ? ', …' : ''}).`)
  return w
}

// ── The datasets the builder can load (the server side lives in src/lib/scatter-data.ts) ──

export type DatasetChoice = { id: string; label: string; group: string; blurb: string; /** true when the table has one row per player, so a player can be followed across seasons */ seasons: boolean }
export const DATASET_CHOICES: DatasetChoice[] = [
  { id: 'bat-all', group: 'Hitters (Savant)', label: 'Every hitter metric', blurb: 'Results, expected stats, batted balls, plate discipline, spray and speed in one table (60+ stats)', seasons: true },
  { id: 'bat-pct', group: 'Hitters (Savant)', label: 'Hitter percentile ranks', blurb: 'Savant percentiles: xwOBA, barrel, exit velocity, chase, whiff, speed, OAA, bat speed', seasons: true },
  { id: 'xstats-bat', group: 'Hitters (Savant)', label: 'Expected stats, hitters', blurb: 'BA, SLG, wOBA against their expected versions', seasons: true },
  { id: 'statcast-bat', group: 'Hitters (Savant)', label: 'Exit velocity and barrels, hitters', blurb: 'Batted-ball quality', seasons: true },
  { id: 'bat-tracking', group: 'Hitters (Savant)', label: 'Bat tracking, hitters', blurb: 'Bat speed, swing length, squared-up and blast rates', seasons: true },
  { id: 'baserun', group: 'Hitters (Savant)', label: 'Baserunning runs', blurb: 'Runs from extra bases, stolen bases and baserunning', seasons: true },
  { id: 'sprint', group: 'Hitters (Savant)', label: 'Sprint speed, players', blurb: 'Sprint speed and home to first', seasons: true },
  { id: 'pit-all', group: 'Pitchers (Savant)', label: 'Every pitcher metric', blurb: 'Results, expected stats, batted balls, plate discipline, velocity, spin, break, extension (70+ stats)', seasons: true },
  { id: 'pit-pct', group: 'Pitchers (Savant)', label: 'Pitcher percentile ranks', blurb: 'Savant percentiles: xERA, whiff, K%, BB%, barrel, hard-hit, velocity, spin', seasons: true },
  { id: 'xstats-pit', group: 'Pitchers (Savant)', label: 'Expected stats, pitchers', blurb: 'ERA against xERA, and wOBA against expected', seasons: true },
  { id: 'statcast-pit', group: 'Pitchers (Savant)', label: 'Exit velocity and barrels allowed', blurb: 'Batted-ball quality against', seasons: true },
  { id: 'pit-speeds', group: 'Pitchers (Savant)', label: 'Pitch speeds by type', blurb: 'Average velocity of each pitch type', seasons: true },
  { id: 'pit-arsenal', group: 'Pitchers (Savant)', label: 'Pitch arsenal (one row per pitch type)', blurb: 'Usage, whiff, runs per 100, xwOBA by pitch; group by pitch name', seasons: false },
  { id: 'drs', group: 'Fielding', label: 'Defensive Runs Saved (DRS), fielders', blurb: 'DRS and its parts from The Fielding Bible (Sports Info Solutions)', seasons: true },
  { id: 'frv', group: 'Fielding', label: 'Fielding runs (FRV), fielders', blurb: 'Savant fielding runs by skill, with innings. DRS is joined on by name', seasons: true },
  { id: 'oaa', group: 'Fielding', label: 'Outs above average, fielders', blurb: 'Savant OAA by direction and batter side. DRS is joined on by name', seasons: true },
  { id: 'arm', group: 'Fielding', label: 'Arm strength, fielders', blurb: 'Average and hardest throw by position', seasons: true },
  { id: 'framing', group: 'Fielding', label: 'Catcher framing', blurb: 'Framing totals by zone', seasons: true },
  { id: 'poptime', group: 'Fielding', label: 'Catcher pop time and arm', blurb: 'Pop time, exchange and arm to second and third', seasons: true },
  { id: 'mlb-hit', group: 'MLB stats (all players)', label: 'Hitters, traditional stats', blurb: 'AVG, OBP, SLG, OPS, HR, RBI, SB, K and BB totals for every player', seasons: true },
  { id: 'mlb-pit', group: 'MLB stats (all players)', label: 'Pitchers, traditional stats', blurb: 'ERA, WHIP, K/9, BB/9, innings, saves and more for every pitcher', seasons: true },
  { id: 'mlb-field', group: 'MLB stats (all players)', label: 'Fielding, traditional stats', blurb: 'Errors, fielding %, assists, putouts, double plays', seasons: true },
  { id: 'mlb-team-hit', group: 'MLB stats (teams)', label: 'Team batting', blurb: 'All 30 clubs: AVG, OBP, SLG, OPS, runs, HR, K and BB', seasons: true },
  { id: 'mlb-team-pit', group: 'MLB stats (teams)', label: 'Team pitching', blurb: 'All 30 clubs: ERA, WHIP, K/9, BB/9, HR/9 and more', seasons: true },
  { id: 'mlb-team-field', group: 'MLB stats (teams)', label: 'Team fielding', blurb: 'All 30 clubs: errors, fielding %, double plays', seasons: true },
]
