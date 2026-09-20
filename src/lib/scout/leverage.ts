// src/lib/scout/leverage.ts
//
// Scout §11 (Leverage & late tendencies) — how a club performs and behaves when the
// game is close and late.
//
//   Offense    — the club's OPS in Late & Close (7th inning or later, tied or within
//                one run), with runners in scoring position, RISP with two outs, and
//                from the 7th on, each against its own season OPS, with the PA behind
//   Pitching   — opponents' OPS against the club in Late & Close and from the 7th on
//   Record     — record in one-run games and in extra innings
//   Bullpen    — per reliever: saves, holds, blown saves (the public marker for entering
//                with the tying or go-ahead run in play), inherited runners scored, and
//                games finished — from the season game logs
//   Aggression — the share of the club's ABS challenges and steal attempts that come in
//                the 7th or later, and (once the game-situation feed is loaded) in
//                late AND close games
// Entry leverage index itself is not published, so save/hold situations stand in.

import { getBullpenDesk, type BullpenArm } from './bullpen-desk'
import { getBullpenTrends, type ArmUsage } from './bullpen-trends'
import { getAbsRows } from './abs-desk'
import { getSbRows } from './situations'

const MLB = 'https://statsapi.mlb.com/api/v1'
export const MIN_LEV_PA = 60

export type SplitLine = { pa: number; ops: number | null; avg: number | null }
export type LeverageArm = { arm: BullpenArm; u: ArmUsage }

export type Leverage = {
  offense: { season: SplitLine; lc: SplitLine; risp: SplitLine; risp2: SplitLine; late: SplitLine }
  pitching: { season: SplitLine; lc: SplitLine; late: SplitLine }
  records: { oneRun: { w: number; l: number } | null; extra: { w: number; l: number } | null }
  arms: LeverageArm[]
  saves: { sv: number; bs: number; hold: number }
  aggression: {
    absLateShare: { club: number | null; league: number | null; n: number }
    absLateClose: { n: number; ov: number } | null      // null until situations are loaded
    sbLate: { club: number | null; league: number | null; n: number } | null
    sbLateClose: { n: number; ok: number } | null
  }
}

const num = (v: unknown): number | null => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }

async function teamSplits(teamId: number, group: 'hitting' | 'pitching', season: string, codes: string[]): Promise<Record<string, SplitLine>> {
  const out: Record<string, SplitLine> = {}
  try {
    const [sp, base] = await Promise.all([
      fetch(`${MLB}/teams/${teamId}/stats?stats=statSplits&group=${group}&season=${season}&sitCodes=${codes.join(',')}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) }),
      fetch(`${MLB}/teams/${teamId}/stats?stats=season&group=${group}&season=${season}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) }),
    ])
    const line = (st: Record<string, unknown> | undefined): SplitLine => ({ pa: Number(st?.plateAppearances ?? st?.battersFaced ?? 0), ops: num(st?.ops), avg: num(st?.avg) })
    if (sp.ok) for (const s of (await sp.json()).stats?.[0]?.splits ?? []) if (s.split?.code) out[s.split.code] = line(s.stat)
    if (base.ok) out.season = line((await base.json()).stats?.[0]?.splits?.[0]?.stat)
  } catch { /* leave empty */ }
  return out
}

async function records(teamId: number, season: string) {
  try {
    const res = await fetch(`${MLB}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { oneRun: null, extra: null }
    for (const rec of (await res.json()).records ?? []) for (const t of rec.teamRecords ?? []) {
      if (t.team?.id !== teamId) continue
      const pick = (type: string) => { const r = t.records?.splitRecords?.find((x: { type: string }) => x.type === type); return r ? { w: r.wins as number, l: r.losses as number } : null }
      return { oneRun: pick('oneRun'), extra: pick('extraInning') }
    }
  } catch { /* fall through */ }
  return { oneRun: null, extra: null }
}

export async function getLeverage(teamId: number, gameDate: string): Promise<Leverage | null> {
  const season = gameDate.slice(0, 4)
  try {
    const desk = await getBullpenDesk(teamId, gameDate).catch(() => null)
    const [hit, pit, rec, trends, absRows, sbRows] = await Promise.all([
      teamSplits(teamId, 'hitting', season, ['lc', 'risp', 'risp2', 'ig07']),
      teamSplits(teamId, 'pitching', season, ['lc', 'ig07']),
      records(teamId, season),
      desk ? getBullpenTrends(teamId, '', '', desk.arms.map((a) => a.id), gameDate).catch(() => null) : Promise.resolve(null),
      getAbsRows().catch(() => []),
      getSbRows().catch(() => null),
    ])
    const z: SplitLine = { pa: 0, ops: null, avg: null }
    const arms: LeverageArm[] = (desk?.arms ?? []).flatMap((arm) => { const u = trends?.arms.get(arm.id); return u ? [{ arm, u }] : [] })

    // ABS: late share and (if situations are loaded) late & close
    const mineAbs = absRows.filter((r) => r.challenging_team_id === teamId)
    const lateAbs = mineAbs.filter((r) => r.inning >= 7)
    const hasSit = absRows.some((r) => r.bat_diff != null)
    const marginOf = (r: (typeof absRows)[number]) => (r.bat_diff == null ? null : r.challenge_side === 'batting' ? r.bat_diff : -r.bat_diff)
    const lc = hasSit ? mineAbs.filter((r) => r.inning >= 7 && marginOf(r) != null && Math.abs(marginOf(r) as number) <= 1) : null

    // SB: late share and late & close
    let sbLate: Leverage['aggression']['sbLate'] = null, sbLateClose: Leverage['aggression']['sbLateClose'] = null
    if (sbRows) {
      const mine = sbRows.filter((r) => r.running_team_id === teamId)
      sbLate = { club: mine.length ? (mine.filter((r) => r.inning >= 7).length / mine.length) * 100 : null, league: sbRows.length ? (sbRows.filter((r) => r.inning >= 7).length / sbRows.length) * 100 : null, n: mine.length }
      const c = mine.filter((r) => r.inning >= 7 && r.run_diff != null && Math.abs(r.run_diff) <= 1)
      sbLateClose = { n: c.length, ok: c.filter((r) => r.success).length }
    }

    return {
      offense: { season: hit.season ?? z, lc: hit.lc ?? z, risp: hit.risp ?? z, risp2: hit.risp2 ?? z, late: hit.ig07 ?? z },
      pitching: { season: pit.season ?? z, lc: pit.lc ?? z, late: pit.ig07 ?? z },
      records: rec, arms,
      saves: { sv: arms.reduce((a, x) => a + x.u.save, 0), bs: arms.reduce((a, x) => a + x.u.bs, 0), hold: arms.reduce((a, x) => a + x.u.hold, 0) },
      aggression: {
        absLateShare: {
          club: mineAbs.length ? (lateAbs.length / mineAbs.length) * 100 : null,
          league: absRows.length ? (absRows.filter((r) => r.inning >= 7).length / absRows.length) * 100 : null, n: mineAbs.length,
        },
        absLateClose: lc ? { n: lc.length, ov: lc.filter((r) => r.is_overturned).length } : null,
        sbLate, sbLateClose,
      },
    }
  } catch (err) {
    console.error('[scout] leverage failed:', teamId, err)
    return null
  }
}
