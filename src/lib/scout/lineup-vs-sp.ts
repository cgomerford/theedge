// src/lib/scout/lineup-vs-sp.ts
//
// Scout §10 (Lineup vs SP deep) — one LINEUP against tonight's opposing starter:
//   Zone clash   — for every hitter, his xwOBA by zone against the starter's usage,
//                  BA-against and whiff by zone (the same batterZoneFit math Key
//                  Players uses), on the split that applies (the starter's hand for
//                  the hitter; the hitter's side for the starter's arsenal)
//   Swing / miss — swing%, whiff% and chase% by pitch family (fastball / breaking /
//                  offspeed) from each hitter's per-pitch zone table, next to how
//                  much of the starter's arsenal each family is
//   Spray lean   — ground-ball / line-drive / fly-ball share and pull rate against
//                  the starter's hand
// Every cell carries its sample; the UI fades anything under the gates below.

import { getProjectedLineup } from '@/lib/lineups'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getBatterHotZones, type ZoneCell } from '@/lib/hot-zones'
import { getLineupZoneArsenal } from '@/lib/batter-zone-arsenal'
import { getLineupSpray, computePullProfile } from '@/lib/batter-spray'
import { fetchPitcherHands } from '@/lib/pitcher-hands'
import { batterZoneFit, type ZoneFitCell } from '@/lib/series-matchup'

export const MIN_CLASH_PITCHES = 150     // a hitter's pitches on the split before his zone map is read
export const MIN_ZONE_PITCHES = 12       // a single zone cell's pitches before it is coloured
export const MIN_FAMILY_SWINGS = 40      // swings behind a whiff% before it is read
export const MIN_BIP = 40                // balls in play behind a spray lean

export type Family = 'Fastball' | 'Breaking' | 'Offspeed'
export const FAMILIES: Family[] = ['Fastball', 'Breaking', 'Offspeed']
const FAMILY_OF: Record<string, Family> = { FF: 'Fastball', SI: 'Fastball', FC: 'Fastball', SL: 'Breaking', ST: 'Breaking', SV: 'Breaking', CU: 'Breaking', KC: 'Breaking', CS: 'Breaking', CH: 'Offspeed', FS: 'Offspeed', FO: 'Offspeed', SC: 'Offspeed' }
const CHASE_ZONES = ['11', '12', '13', '14']

export type FamilyTally = { pitches: number; swings: number; whiffs: number; chasePitches: number; chaseSwings: number }
const emptyFamily = (): FamilyTally => ({ pitches: 0, swings: 0, whiffs: 0, chasePitches: 0, chaseSwings: 0 })

export type Spray = { bip: number; gbPct: number; ldPct: number; fbPct: number; pullPct: number | null; pulledGbPct: number | null; vsHand: boolean }

export type Hitter = {
  id: number; name: string; order: number; stand: 'L' | 'R'; switchHitter: boolean
  clash: { total: number; cells: ZoneFitCell[]; pitches: number; split: string; zoneN: Record<string, number>; /** the hitter's own per-zone numbers on this split, for the metric toggle */ zones: Record<string, ZoneCell> } | null
  families: Record<Family, FamilyTally>
  spray: Spray | null
}

export type LineupVsSp = {
  sp: { id: number; name: string; hand: 'L' | 'R' | null; familyUsage: Record<Family, number>; pitches: number }
  hitters: Hitter[]
  lineup: { families: Record<Family, FamilyTally>; spray: Spray | null }
  source: string
}

export async function getLineupVsSp(offenseId: number, spId: number, spName: string, gameDate: string, gamePk: number): Promise<LineupVsSp | null> {
  try {
    const [lineup, hands, arsenalBySplit] = await Promise.all([
      getProjectedLineup(offenseId, gameDate, gamePk), fetchPitcherHands([spId]), getPitcherZoneArsenal(spId),
    ])
    if (lineup.batters.length === 0) return null
    const hand = hands.get(spId) ?? null
    const ids = lineup.batters.map((b) => b.player_id)
    const [hotZones, zoneArsenal, spray] = await Promise.all([
      Promise.all(ids.map((id) => getBatterHotZones(id))), getLineupZoneArsenal(ids), getLineupSpray(ids),
    ])

    const batterSplit = hand === 'L' ? 'vs_lhp' : hand === 'R' ? 'vs_rhp' : 'all'
    const allArsenal = arsenalBySplit.all ?? Object.values(arsenalBySplit)[0]
    const familyUsage: Record<Family, number> = { Fastball: 0, Breaking: 0, Offspeed: 0 }
    let spPitches = 0
    for (const [pt, p] of Object.entries(allArsenal?.arsenal ?? {})) {
      const n = Object.values(p.zones ?? {}).reduce((a, c) => a + c.pitches, 0)
      const f = FAMILY_OF[pt]; if (f) familyUsage[f] += n
      spPitches += n
    }
    for (const f of FAMILIES) familyUsage[f] = spPitches > 0 ? (familyUsage[f] / spPitches) * 100 : 0

    const lineupFamilies: Record<Family, FamilyTally> = { Fastball: emptyFamily(), Breaking: emptyFamily(), Offspeed: emptyFamily() }
    const sprayAll: { gb: number; ld: number; fb: number; n: number } = { gb: 0, ld: 0, fb: 0, n: 0 }

    const hitters: Hitter[] = lineup.batters.map((b, i) => {
      const isSwitch = !!b.switch_hitter || b.bat_side == null
      const stand: 'L' | 'R' = isSwitch ? (hand === 'R' ? 'L' : 'R') : (b.bat_side as 'L' | 'R')

      // zone clash
      const hz = hotZones[i]
      const bz = hz[batterSplit] && hz[batterSplit].total_pitches >= MIN_CLASH_PITCHES ? hz[batterSplit] : hz.all
      const arsSplit = stand === 'L' ? 'vs_lhb' : 'vs_rhb'
      const ars = arsenalBySplit[arsSplit] ?? arsenalBySplit.all
      const fit = bz && ars ? batterZoneFit(bz, ars) : null
      const clash = fit && fit.cells.length > 0 ? { total: fit.total, cells: fit.cells, pitches: bz?.total_pitches ?? 0, split: bz === hz.all ? 'all' : batterSplit, zoneN: Object.fromEntries(Object.entries(bz?.zones ?? {}).map(([z, c]) => [z, c.pitches ?? 0])), zones: bz?.zones ?? {} } : null

      // swing / miss by pitch family (his per-pitch zone table on the applicable split)
      const za = zoneArsenal[b.player_id]
      const zsplit = za?.[batterSplit] ?? za?.all
      const families: Hitter['families'] = { Fastball: emptyFamily(), Breaking: emptyFamily(), Offspeed: emptyFamily() }
      for (const [pt, p] of Object.entries(zsplit?.arsenal ?? {})) {
        const f = FAMILY_OF[pt]; if (!f) continue
        for (const [zone, cell] of Object.entries(p.zones ?? {})) {
          for (const t of [families[f], lineupFamilies[f]]) {
            t.pitches += cell.pitches; t.swings += cell.swings; t.whiffs += cell.whiffs
            if (CHASE_ZONES.includes(zone)) { t.chasePitches += cell.pitches; t.chaseSwings += cell.swings }
          }
        }
      }

      // spray lean vs the starter's hand
      const sp = spray.find((s) => s.player_id === b.player_id)
      let sprayOut: Spray | null = null
      if (sp) {
        const vsHand = hand ? sp.plays.filter((p) => p.pt === hand) : []
        const pool = vsHand.length >= MIN_BIP ? vsHand : sp.plays
        const bt = pool.filter((p) => p.bt)
        if (bt.length >= MIN_BIP) {
          const gb = bt.filter((p) => p.bt === 'ground_ball').length, ld = bt.filter((p) => p.bt === 'line_drive').length
          const fb = bt.length - gb - ld
          const pull = computePullProfile(sp.plays, stand, hand)
          sprayOut = { bip: bt.length, gbPct: (gb / bt.length) * 100, ldPct: (ld / bt.length) * 100, fbPct: (fb / bt.length) * 100, pullPct: pull?.pullPct ?? null, pulledGbPct: pull?.pulledGbPct ?? null, vsHand: vsHand.length >= MIN_BIP }
          sprayAll.gb += gb; sprayAll.ld += ld; sprayAll.fb += fb; sprayAll.n += bt.length
        }
      }
      return { id: b.player_id, name: b.player_name, order: b.batting_order, stand, switchHitter: isSwitch, clash, families, spray: sprayOut }
    })

    return {
      sp: { id: spId, name: spName, hand, familyUsage, pitches: spPitches },
      hitters,
      lineup: { families: lineupFamilies, spray: sprayAll.n >= MIN_BIP ? { bip: sprayAll.n, gbPct: (sprayAll.gb / sprayAll.n) * 100, ldPct: (sprayAll.ld / sprayAll.n) * 100, fbPct: (sprayAll.fb / sprayAll.n) * 100, pullPct: null, pulledGbPct: null, vsHand: !!hand } : null },
      source: lineup.source,
    }
  } catch (err) {
    console.error('[scout] lineup vs sp failed:', offenseId, err)
    return null
  }
}
