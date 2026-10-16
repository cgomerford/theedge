'use client'

import { SANS } from '@/components/team/ui'
import { fmtFixed, SP_HEADLINE, SP_KICKER, SP_LABEL_L3 } from '../copy'
import { BODY_TOP, COL2, SPACE, TYPE } from '../layout'
import { buildEndOf, prog, revealAt } from '../motion'
import Body from '../parts/Body'
import Header from '../parts/Header'
import NamePlate from '../parts/NamePlate'
import StatRow from '../parts/StatRow'
import type { SpStats, StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

type RowDef = { label: string; key: keyof SpStats; d: number; lowerBetter: boolean }
const MAIN: RowDef[] = [
  { label: 'ERA', key: 'era', d: 2, lowerBetter: true },
  { label: 'FIP', key: 'fip', d: 2, lowerBetter: true },
  { label: 'WHIP', key: 'whip', d: 2, lowerBetter: true },
  { label: 'K/9', key: 'k9', d: 1, lowerBetter: false },
  { label: 'BB/9', key: 'bb9', d: 1, lowerBetter: true },
  { label: 'K–BB/9', key: 'kbb9', d: 1, lowerBetter: false },
]
const L3: RowDef = { label: 'L3 ERA', key: 'l3Era', d: 2, lowerBetter: true }

/** Rows that will actually render for this game (also drives the duration). */
export function spRows(game: StoryGame): { main: RowDef[]; l3: RowDef | null } {
  const has = (r: RowDef) => game.sp.away.stats?.[r.key] != null || game.sp.home.stats?.[r.key] != null
  return { main: MAIN.filter(has), l3: has(L3) ? L3 : null }
}

export default function SpDuel({ game, localT, dur }: P) {
  const { away, home, sp } = game
  const get = (side: 'away' | 'home', k: keyof SpStats) => sp[side].stats?.[k] ?? null
  const { main, l3 } = spRows(game)
  let n = 0
  const total = main.length + (l3 ? 1 : 0)
  const be = buildEndOf(dur)
  const row = (r: RowDef) => {
    const a = get('away', r.key), h = get('home', r.key)
    const p = prog(localT, revealAt(n++, total, be), 0.25)
    return <StatRow key={r.label} label={r.label} a={a} h={h} away={fmtFixed(a, r.d)} home={fmtFixed(h, r.d)} p={p} lowerBetter={r.lowerBetter} />
  }
  const cap = (txt: string) => (
    <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)', paddingLeft: SPACE.xs, height: 36, lineHeight: '36px' }}>{txt}</div>
  )
  const plate = (side: 'away' | 'home', i: number) => {
    const t = side === 'away' ? away : home
    const s = sp[side]
    return <NamePlate id={s.id} name={s.name} short={s.short} sub={`SP · ${t.abbr}`} color={t.color} head={96} width={COL2} pop={prog(localT, i * 0.08, 0.25)} />
  }
  return (
    <>
      <Header kicker={SP_KICKER} headline={SP_HEADLINE} />
      <Body gap={SPACE.s} top={BODY_TOP}>
        <div style={{ display: 'flex', gap: SPACE.l, marginBottom: SPACE.s }}>{plate('away', 0)}{plate('home', 1)}</div>
        {main.length > 0 && cap(game.spLabel)}
        {main.map(row)}
        {l3 && cap(SP_LABEL_L3)}
        {l3 && row(l3)}
      </Body>
    </>
  )
}
