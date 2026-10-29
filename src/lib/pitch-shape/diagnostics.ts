// src/lib/pitch-shape/diagnostics.ts
//
// The numbers behind "ahead of / behind the shape": for one pitcher and for the league (same pitch type, hand and season), the location rates (zone%, down the
// middle, chase%), the umpire's calls, how repeatable the movement is, and contact results (contact QUALITY allowed, xwOBAcon, against what actually happened,
// wOBAcon; the gap between the two is the part defense and luck account for). Pure functions over the pitch_shape_pitcher row, so they are tested.
// A figure whose count is missing (rows written before the diagnostics migration) is null, shown as "—", never estimated.

export type DiagRow = {
  sd_hb: number | string | null; sd_ivb: number | string | null
  n_taken: number | null; n_gift: number | null; n_miss: number | null
  n_loc?: number | null; n_zone?: number | null; n_heart?: number | null; n_ooz?: number | null; n_chase?: number | null
  n_bbe?: number | null; xwoba_con_sum?: number | string | null; n_bbe_w?: number | null; woba_con_sum?: number | string | null
  batter_sides?: { bbe: number; xwoba_sum: number }[] | null
  n_pitches: number
}

export type Diag = {
  zonePct: number | null; heartPct: number | null; chasePct: number | null
  xwobaCon: number | null; wobaCon: number | null; nBbe: number
  giftPct: number | null; missPct: number | null
  sdHb: number | null; sdIvb: number | null
  nLoc: number; nOoz: number
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const ratio = (a: number | null, b: number | null): number | null => (a == null || b == null || b <= 0 ? null : a / b)

export function diagOf(r: DiagRow): Diag {
  const sides = r.batter_sides ?? []
  const sideBbe = sides.reduce((s, x) => s + (x.bbe ?? 0), 0)
  const sideXw = sides.reduce((s, x) => s + (x.xwoba_sum ?? 0), 0)
  const nBbe = r.n_bbe ?? sideBbe
  const xwSum = num(r.xwoba_con_sum) ?? (sideBbe > 0 ? sideXw : null)
  return {
    zonePct: ratio(r.n_zone ?? null, r.n_loc ?? null),
    heartPct: ratio(r.n_heart ?? null, r.n_loc ?? null),
    chasePct: ratio(r.n_chase ?? null, r.n_ooz ?? null),
    xwobaCon: ratio(xwSum, nBbe),
    wobaCon: ratio(num(r.woba_con_sum), r.n_bbe_w ?? null),
    nBbe: nBbe ?? 0,
    giftPct: ratio(r.n_gift, r.n_taken),
    missPct: ratio(r.n_miss, r.n_taken),
    sdHb: num(r.sd_hb), sdIvb: num(r.sd_ivb),
    nLoc: r.n_loc ?? 0, nOoz: r.n_ooz ?? 0,
  }
}

/** League figures for the same pitch type, hand and season: pooled over every pitcher (so big samples count for more). */
export function leagueOf(rows: DiagRow[]): Diag {
  const sum = (f: (r: DiagRow) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0), 0)
  const have = (f: (r: DiagRow) => number | null | undefined) => rows.some(r => f(r) != null)
  const loc = sum(r => r.n_loc ?? null), ooz = sum(r => r.n_ooz ?? null)
  const sidesBbe = rows.reduce((s, r) => s + (r.batter_sides ?? []).reduce((a, x) => a + (x.bbe ?? 0), 0), 0)
  const sidesXw = rows.reduce((s, r) => s + (r.batter_sides ?? []).reduce((a, x) => a + (x.xwoba_sum ?? 0), 0), 0)
  const bbe = have(r => r.n_bbe) ? sum(r => r.n_bbe ?? null) : sidesBbe
  const xw = have(r => num(r.xwoba_con_sum)) ? sum(r => num(r.xwoba_con_sum)) : sidesXw
  const wN = sum(r => r.n_bbe_w ?? null)
  const taken = sum(r => r.n_taken)
  const w = (f: (r: DiagRow) => number | null) => {
    const withV = rows.filter(r => f(r) != null)
    const tot = withV.reduce((s, r) => s + r.n_pitches, 0)
    return tot > 0 ? withV.reduce((s, r) => s + (f(r) as number) * r.n_pitches, 0) / tot : null
  }
  return {
    zonePct: have(r => r.n_zone) ? ratio(sum(r => r.n_zone ?? null), loc) : null,
    heartPct: have(r => r.n_heart) ? ratio(sum(r => r.n_heart ?? null), loc) : null,
    chasePct: have(r => r.n_chase) ? ratio(sum(r => r.n_chase ?? null), ooz) : null,
    xwobaCon: ratio(xw, bbe),
    wobaCon: have(r => num(r.woba_con_sum)) ? ratio(sum(r => num(r.woba_con_sum)), wN) : null,
    nBbe: bbe, giftPct: ratio(sum(r => r.n_gift), taken), missPct: ratio(sum(r => r.n_miss), taken),
    sdHb: w(r => num(r.sd_hb)), sdIvb: w(r => num(r.sd_ivb)), nLoc: loc, nOoz: ooz,
  }
}
