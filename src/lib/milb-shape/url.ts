// src/lib/milb-shape/url.ts
//
// The Pitch Shape Lab's view in the address bar, so a view can be reloaded, shared and stepped through with back and forward. Pure functions over a query string (tested).
// The Lab had no share or URL feature before this, so these are plain query parameters and nothing more.
//
//   level=mlb|aaa|fsl   season=2026 (minor-league views only)
//   map:      pitch=FF  hand=R|L  window=latest|all  radius=0.5|1|2
//   sandbox:  spitch=FF  shand=R|L  v=94.5 (mph)  ride=16 (in)  run=9 (in)  arm=45 (degrees)
// Anything missing or unrecognised is left out of the parsed result, so the Lab falls back to its own default for it. MLB is the default level and is not written.

import { DEFAULT_LEVEL, isLevel, type Level } from './levels'

export type ShapeUrl = {
  level?: Level; season?: number
  pitch?: string; hand?: 'R' | 'L' | 'B'; window?: 'latest' | 'all'; radius?: 0.5 | 1 | 2
  spitch?: string; shand?: 'R' | 'L'; v?: number; ride?: number; run?: number; arm?: number
  /** the minor-league Refine choices */
  rmlb?: 'never' | 'before' | 'this-season' | 'sent-down'; rres?: 'struggled' | 'good' | 'thin'; rmov?: 'traded-12' | 'traded-season' | 'not-traded'
  rcarry?: 'minors-only' | 'holds' | 'mlb-better' | 'neither'; rver?: 'ahead' | 'behind' | 'level'; rrank?: number; rmin?: number; rmax?: number; rorg?: number
}

const PITCH = /^[A-Z]{2}$/
const num = (x: string | null, lo: number, hi: number): number | undefined => {
  if (x == null || x === '') return undefined
  const n = Number(x)
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined
}
const hand = (x: string | null) => (x === 'R' || x === 'L' ? x : undefined)
/** The map's hand: right, left, or B for both together (the sandbox's shand stays a single hand: a pitch is thrown by one arm). */
const viewHand = (x: string | null) => (x === 'R' || x === 'L' || x === 'B' ? x : undefined)

export function parseShapeUrl(search: string): ShapeUrl {
  const p = new URLSearchParams(search)
  const out: ShapeUrl = {}
  const lv = p.get('level')
  if (lv && isLevel(lv)) out.level = lv
  const season = num(p.get('season'), 2021, 2100)
  if (season != null && Number.isInteger(season)) out.season = season
  const pitch = p.get('pitch'); if (pitch && PITCH.test(pitch)) out.pitch = pitch
  const h = viewHand(p.get('hand')); if (h) out.hand = h
  const w = p.get('window'); if (w === 'latest' || w === 'all') out.window = w
  const r = num(p.get('radius'), 0.4, 2.1); if (r === 0.5 || r === 1 || r === 2) out.radius = r
  const sp = p.get('spitch'); if (sp && PITCH.test(sp)) out.spitch = sp
  const sh = hand(p.get('shand')); if (sh) out.shand = sh
  const v = num(p.get('v'), 60, 110); if (v != null) out.v = v
  const ride = num(p.get('ride'), -40, 60); if (ride != null) out.ride = ride
  const run = num(p.get('run'), -40, 60); if (run != null) out.run = run
  const arm = num(p.get('arm'), 0, 100); if (arm != null) out.arm = arm
  const pick = <T extends string>(k: string, ok: readonly T[]): T | undefined => { const x = p.get(k); return x && (ok as readonly string[]).includes(x) ? (x as T) : undefined }
  const rmlb = pick('rmlb', ['never', 'before', 'this-season', 'sent-down'] as const); if (rmlb) out.rmlb = rmlb
  const rres = pick('rres', ['struggled', 'good', 'thin'] as const); if (rres) out.rres = rres
  const rmov = pick('rmov', ['traded-12', 'traded-season', 'not-traded'] as const); if (rmov) out.rmov = rmov
  const rcarry = pick('rcarry', ['minors-only', 'holds', 'mlb-better', 'neither'] as const); if (rcarry) out.rcarry = rcarry
  const rver = pick('rver', ['ahead', 'behind', 'level'] as const); if (rver) out.rver = rver
  const rrank = num(p.get('rrank'), 5, 95); if (rrank != null && Number.isInteger(rrank)) out.rrank = rrank
  const rmin = num(p.get('rmin'), 15, 60); if (rmin != null && Number.isInteger(rmin)) out.rmin = rmin
  const rmax = num(p.get('rmax'), 15, 60); if (rmax != null && Number.isInteger(rmax)) out.rmax = rmax
  const rorg = num(p.get('rorg'), 100, 999); if (rorg != null && Number.isInteger(rorg)) out.rorg = rorg
  return out
}

/** Apply a patch to a query string, keeping every unrelated parameter. A patch value of undefined (or the default level) removes the parameter. Returns the new query string, with no leading "?". */
export function applyShapeUrl(search: string, patch: Partial<Record<keyof ShapeUrl, string | number | undefined>>): string {
  const p = new URLSearchParams(search)
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '' || (k === 'level' && v === DEFAULT_LEVEL)) p.delete(k)
    else p.set(k, typeof v === 'number' ? String(Math.round(v * 10) / 10) : v)
  }
  return p.toString()
}

/** Keyboard behaviour of the level selector (a radio group): arrows move and select, Home and End jump. Returns the new level, or null for a key that does nothing. */
export function levelAfterKey(levels: readonly Level[], current: Level, key: string): Level | null {
  const i = levels.indexOf(current)
  if (i < 0) return null
  if (key === 'ArrowRight' || key === 'ArrowDown') return levels[(i + 1) % levels.length]
  if (key === 'ArrowLeft' || key === 'ArrowUp') return levels[(i - 1 + levels.length) % levels.length]
  if (key === 'Home') return levels[0]
  if (key === 'End') return levels[levels.length - 1]
  return null
}
