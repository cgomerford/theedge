// src/components/admin/story-v5/defense.ts
//
// Pure: Savant Outs Above Average rows (one csv per position, pos=3..9) + a lineup -> the field graphic for one club.
// A player's OAA is the sum of his rows across positions. If he earned most of it at a different position than the one he is
// slotted at, the fielder gets an asterisk and the club gets a footnote. A fielder with no OAA row is a problem, never a zero.

import { lastName } from './beats'
import { headshotUrl } from './teams'
import type { DefenseSide, Fielder, Side } from './types'

export type OaaRow = { id: number; name: string; team: string; pos: string; oaa: number }
export type LineupSlot = { player_id: number; player_name: string; position: string }
export const FIELD_POS = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const
/** Savant leaderboard `pos` codes. */
export const POS_CODE: Record<string, string> = { '1B': '3', '2B': '4', '3B': '5', SS: '6', LF: '7', CF: '8', RF: '9' }
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

export function buildDefense(side: Side, teamId: number, nickname: string, lineup: LineupSlot[], rows: OaaRow[], confirmed: boolean): { data: DefenseSide | null; problems: string[] } {
  const problems: string[] = []
  const total = new Map<number, { sum: number; byPos: Map<string, number> }>()
  for (const r of rows) {
    const e = total.get(r.id) ?? { sum: 0, byPos: new Map() }
    e.sum += r.oaa; e.byPos.set(r.pos, (e.byPos.get(r.pos) ?? 0) + r.oaa)
    total.set(r.id, e)
  }
  const fielders: Fielder[] = []
  for (const slot of FIELD_POS) {
    const b = lineup.find(x => x.position === slot)
    if (!b) { problems.push(`${nickname} defense: no ${slot} in the lineup (positions found: ${lineup.map(x => x.position).join(' ')})`); continue }
    const e = total.get(b.player_id)
    if (!e) { problems.push(`${nickname} defense: no OAA row for ${b.player_name} (${slot})`); continue }
    const main = [...e.byPos].sort((a, c) => Math.abs(c[1]) - Math.abs(a[1]))[0][0]
    fielders.push({ pos: slot, id: b.player_id, name: b.player_name, last: lastName(b.player_name), oaa: e.sum, mainPos: main, offPosition: main !== slot, headshot: headshotUrl(b.player_id) })
  }
  const nick = norm(nickname)
  const teamRows = rows.filter(r => { const t = norm(r.team); return t === nick || t.endsWith(nick) || nick.endsWith(t) })
  if (!teamRows.length) problems.push(`${nickname} defense: no team OAA rows in the Savant leaderboard`)
  if (problems.length) return { data: null, problems }
  const best = [...fielders].filter(f => f.oaa >= 1).sort((a, b) => b.oaa - a.oaa).slice(0, 2)
  const headline = best.length === 2 ? `${best[0].last} and ${best[1].last} take hits away.` : best.length === 1 ? `${best[0].last} takes hits away.` : `${nickname} defense, by Outs Above Average.`
  const footnotes = [...new Set(fielders.filter(f => f.offPosition).map(f => `* OAA MOSTLY AT ${f.mainPos}`))]
  return { data: { side, teamId, fielders, teamOaa: teamRows.reduce((a, r) => a + r.oaa, 0), lineupConfirmed: confirmed, footnotes, headline }, problems }
}

// ── alignment from a finished game ────────────────────────────────────────
// A projected lineup must use each slot's STARTER and his starting position. The box score's battingOrder lists the LAST player in
// each slot (a pinch runner shows as "PR"), so read players[].battingOrder instead: "100", "200", ... are starters, "101" a sub.
type StartPlayer = { person: { id: number; fullName: string }; battingOrder?: string; allPositions?: { abbreviation: string }[]; position?: { abbreviation: string } }
export function startersFromBox(players: Record<string, StartPlayer>): LineupSlot[] {
  return Object.values(players)
    .filter(p => p.battingOrder && p.battingOrder.endsWith('00'))
    .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
    .map(p => ({ player_id: p.person.id, player_name: p.person.fullName, position: p.allPositions?.[0]?.abbreviation ?? p.position?.abbreviation ?? '' }))
}
