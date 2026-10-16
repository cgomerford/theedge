// src/components/admin/story/hook.ts
//
// The one-line scout note under the hook headline. Pure; the first rule that
// has real data wins and every number carries its sample.

import { HOOK_FALLBACK, fmtFixed } from './copy'
import { fitText } from './fit'
import { SAFE_W, TYPE } from './layout'
import type { HookNote, StoryGame } from './types'

const NICK_TWO_WORD = ['White Sox', 'Red Sox', 'Blue Jays']

/** "Chicago White Sox" → "White Sox"; "San Diego Padres" → "Padres". */
export function teamNickname(name: string): string {
  const t = name.trim()
  for (const n of NICK_TWO_WORD) if (t.toLowerCase().endsWith(n.toLowerCase())) return n
  const parts = t.split(/\s+/)
  return parts[parts.length - 1]
}

type HookInput = Pick<StoryGame, 'streakPool' | 'sp' | 'bullpen' | 'seasonLabel' | 'spLabel' | 'away' | 'home' | 'series' | 'seriesState'> & { teamIds?: { away: number; home: number } | null }

/** "CWS lead 2-0" / "Series tied 1-1", plus who is facing elimination. Pure. */
export function seriesNote(g: HookInput): string | null {
  const st = g.seriesState, se = g.series
  if (!st || !se || !g.teamIds) return null
  const abbrOf = (id: number | null) => (id === g.teamIds!.away ? g.away.abbr : id === g.teamIds!.home ? g.home.abbr : null)
  if (st.tied) return `${se.label}: series tied ${st.wins}-${st.losses} · Game ${se.game}${se.of > 1 ? ` of ${se.of}` : ''}`
  const lead = abbrOf(st.leaderId)
  if (!lead) return null
  const trail = lead === g.away.abbr ? g.home.abbr : g.away.abbr
  const need = Math.ceil(se.of / 2)
  const elim = st.wins === need - 1 && se.of > 1 ? ` · ${trail} facing elimination` : ''
  return `${se.label}: ${lead} lead ${st.wins}-${st.losses}${elim}`
}

export function hookNote(g: HookInput): HookNote {
  // p) postseason: the series state leads the note
  const sn = seriesNote(g)
  if (sn) return { rule: 'p', text: sn }

  // a) longest active on-base streak ≥ 10
  const onBase = g.streakPool.filter(s => s.kind === 'on_base').sort((x, y) => y.n - x.n)[0]
  if (onBase && onBase.n >= 10) {
    return { rule: 'a', text: `${onBase.short}: on base in ${onBase.n} straight · ${g.seasonLabel}` }
  }

  // b) SP FIP gap ≥ 0.75
  const aF = g.sp.away.stats?.fip, hF = g.sp.home.stats?.fip
  if (aF != null && hF != null && Math.abs(aF - hF) >= 0.75) {
    return { rule: 'b', text: `${g.sp.away.short} ${fmtFixed(aF)} FIP vs ${g.sp.home.short} ${fmtFixed(hF)} · ${g.spLabel}` }
  }

  // c) bullpen pitches over the last three days, gap ≥ 25
  const bp = g.bullpen
  if (bp?.away && bp?.home && Math.abs(bp.away.total - bp.home.total) >= 25) {
    const [heavy, light] = bp.away.total >= bp.home.total ? [bp.away, bp.home] : [bp.home, bp.away]
    return { rule: 'c', text: `${heavy.abbr} pen threw ${heavy.total} pitches ${bp.dateRange}; ${light.abbr} ${light.total}` }
  }

  return { rule: 'd', text: HOOK_FALLBACK }
}

export const NOTE_PAD = 36

/** Scout-note card geometry (shared by Hook.tsx and the duration rule): font size, line count, card height. */
export function noteFit(text: string) {
  const f = fitText(text, { maxWidth: SAFE_W - NOTE_PAD * 4, maxSize: TYPE.sub, minSize: TYPE.label, widthEm: 0.52 })
  return { size: f.size, lines: f.lines, height: Math.ceil(f.lines * f.size * 1.2) + NOTE_PAD * 2 + 4 }
}
