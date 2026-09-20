// src/lib/postgame/zoneresult.ts
//
// Pro §16 Zone clash result — for each hitter who faced the opposing starter, the zone where his
// season damage is greatest (batter_hot_zones, split `all`: highest xwOBA among the nine strike-zone
// cells with at least MIN_PITCHES pitches; read-only) and what happened to the pitches thrown there
// tonight. Verdict, fixed rules: Fired = a hit or a ball hit 95+ mph off a pitch in that zone;
// Contained = pitches went there but did no damage; Avoided = none went there. Only pitches from the
// starter count. The zone map's own sample is shown so a thin one can be discounted.

import { createAdminClient } from '@/lib/supabase'
import type { PostData } from './data'
import { buildPitchLog, startersOf } from './pitchlog'
import type { Side } from './recap'

export const MIN_PITCHES = 8
type ZoneCell = { xwoba?: number | null; pitches?: number }

export type ZoneVerdict = 'Fired' | 'Contained' | 'Avoided'
export type ClashRow = {
  id: number; name: string; slot: number
  zone: number; xwoba: number; sample: number          // season pitches behind the damage-zone read
  seen: number                                         // pitches the starter threw there tonight
  swings: number; whiffs: number
  contact: { result: string; ev: number | null; hit: boolean }[]
  tonight: Record<string, number>                      // all of the starter's pitches to him, by zone
  verdict: ZoneVerdict
}
export type ClashSide = { side: Side; starterId: number; starter: string; rows: ClashRow[]; thin: string[] }

export async function getZoneClash(d: PostData, gameDate: string): Promise<ClashSide[]> {
  const starters = startersOf(d)
  const log = buildPitchLog(d)
  const box = d.feed.liveData.boxscore.teams
  const perSide = starters.map((st) => {
    const bat: Side = st.side === 'away' ? 'home' : 'away'
    const faced = new Set(log.filter((p) => p.pitcherId === st.id).map((p) => p.batterId))
    const lineup = Object.values(box[bat].players).filter((p) => p.battingOrder && faced.has(p.person.id))
      .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
    return { st, bat, lineup }
  })
  const ids = perSide.flatMap((x) => x.lineup.map((p) => p.person.id))
  const zones = new Map<number, Record<string, ZoneCell>>()
  if (ids.length > 0) {
    const { data, error } = await createAdminClient().from('batter_hot_zones').select('player_id, zones')
      .in('player_id', ids).eq('season', Number(gameDate.slice(0, 4))).eq('split', 'all')
    if (error) console.error('[getZoneClash] Supabase error:', error.message)
    for (const r of (data ?? []) as { player_id: number; zones: Record<string, ZoneCell> }[]) zones.set(Number(r.player_id), r.zones ?? {})
  }

  return perSide.map(({ st, lineup }) => {
    const rows: ClashRow[] = [], thin: string[] = []
    for (const p of lineup) {
      const z = zones.get(p.person.id)
      const best = z ? Object.entries(z).filter(([k, c]) => Number(k) >= 1 && Number(k) <= 9 && (c.pitches ?? 0) >= MIN_PITCHES && c.xwoba != null && Number.isFinite(Number(c.xwoba)))
        .map(([k, c]) => ({ zone: Number(k), xwoba: Number(c.xwoba), sample: c.pitches ?? 0 })).sort((a, b) => b.xwoba - a.xwoba)[0] : undefined
      if (!best) { thin.push(p.person.fullName); continue }
      const mine = log.filter((x) => x.pitcherId === st.id && x.batterId === p.person.id)
      const there = mine.filter((x) => x.zone === best.zone)
      const contact = there.filter((x) => x.inPlay).map((x) => ({ result: x.result, ev: x.ev, hit: x.hit }))
      const tonight: Record<string, number> = {}
      for (const x of mine) if (x.zone != null) tonight[String(x.zone)] = (tonight[String(x.zone)] ?? 0) + 1
      const fired = contact.some((c) => c.hit || (c.ev ?? 0) >= 95)
      rows.push({
        id: p.person.id, name: p.person.fullName, slot: Math.floor(Number(p.battingOrder) / 100),
        ...best, seen: there.length, swings: there.filter((x) => x.swing).length, whiffs: there.filter((x) => x.whiff).length,
        contact, tonight, verdict: fired ? 'Fired' : there.length > 0 ? 'Contained' : 'Avoided',
      })
    }
    return { side: st.side, starterId: st.id, starter: st.name, rows, thin }
  })
}
