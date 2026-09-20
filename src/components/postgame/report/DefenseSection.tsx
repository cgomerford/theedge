// src/components/postgame/report/DefenseSection.tsx
//
// §10 Defense & run game — two lists, straight from the feed's play-by-play: what each defense did
// (errors, double plays turned, outfield assists) and how the running game went (steals, caught
// stealing, pickoffs, wild pitches, passed balls, balks), with a club tag and inning on each line.
// Empty groups say so ("no errors") — a clean game is information too.

import { getPostData } from '@/lib/postgame/data'
import { buildDefense, type DefEvent } from '@/lib/postgame/defense'
import { Empty, Eyebrow, Foot, SIDE_COLOR, Stat, ordinal } from './ui'
import type { PostgameContext } from './types'

const DEFENSE_KINDS = new Set<DefEvent['kind']>(['error', 'dp', 'of-assist'])
const ICON: Record<DefEvent['kind'], string> = { error: 'E', dp: 'DP', 'of-assist': 'OF', steal: 'SB', caught: 'CS', pickoff: 'PO', wp: 'WP', pb: 'PB', balk: 'BK' }

function Row({ e, ctx }: { e: DefEvent; ctx: PostgameContext }) {
  // defense lines belong to the fielding club; running-game lines to the club that was batting
  const side = DEFENSE_KINDS.has(e.kind) ? e.fielding : e.fielding === 'home' ? 'away' : 'home'
  return (
    <li className="flex gap-2.5 items-start rounded-lg border border-stone-200 bg-white px-2.5 py-2">
      <span className={`shrink-0 w-7 text-center text-[9.5px] font-mono font-bold py-0.5 ${e.kind === 'error' ? 'bg-stone-900 text-yellow-300' : 'bg-stone-100 text-stone-700'}`}>{ICON[e.kind]}</span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-mono uppercase tracking-wider text-stone-400"><span style={{ color: SIDE_COLOR[side] }} className="font-bold">{ctx[side].abbr}</span> · {e.top ? 'Top' : 'Bot'} {ordinal(e.inning)}{e.unearnedRuns > 0 ? ` · ${e.unearnedRuns} unearned run${e.unearnedRuns > 1 ? 's' : ''} scored` : ''}</p>
        <p className="text-[12px] font-sans text-stone-700 leading-snug">{e.text}</p>
      </div>
    </li>
  )
}

export default async function DefenseSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <Empty>The game feed isn&apos;t available, so defense and running-game events can&apos;t be listed.</Empty>
  const d = buildDefense(data)
  const def = d.events.filter((e) => DEFENSE_KINDS.has(e.kind)), run = d.events.filter((e) => !DEFENSE_KINDS.has(e.kind))
  // steals belong to the club that was batting: fielding home → away stole
  const sb = (s: 'away' | 'home') => run.filter((e) => e.kind === 'steal' && (e.fielding === 'home' ? 'away' : 'home') === s).length
  const cs = (s: 'away' | 'home') => run.filter((e) => e.kind === 'caught' && (e.fielding === 'home' ? 'away' : 'home') === s).length
  const dps = (s: 'away' | 'home') => def.filter((e) => e.kind === 'dp' && e.fielding === s).length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Errors" value={<><span style={{ color: SIDE_COLOR.away }}>{d.teamErrors.away}</span><span className="text-stone-300"> · </span><span style={{ color: SIDE_COLOR.home }}>{d.teamErrors.home}</span></>} sub={`${ctx.away.abbr} · ${ctx.home.abbr}`} />
        <Stat label="Double plays turned" value={<><span style={{ color: SIDE_COLOR.away }}>{dps('away')}</span><span className="text-stone-300"> · </span><span style={{ color: SIDE_COLOR.home }}>{dps('home')}</span></>} sub={`${ctx.away.abbr} · ${ctx.home.abbr}`} />
        <Stat label="Steals (SB–CS)" value={<><span style={{ color: SIDE_COLOR.away }}>{sb('away')}-{cs('away')}</span><span className="text-stone-300"> · </span><span style={{ color: SIDE_COLOR.home }}>{sb('home')}-{cs('home')}</span></>} sub={`${ctx.away.abbr} · ${ctx.home.abbr}`} />
        <Stat label="Unearned runs from errors" value={<><span style={{ color: SIDE_COLOR.away }}>{d.runs.unearned.home}</span><span className="text-stone-300"> · </span><span style={{ color: SIDE_COLOR.home }}>{d.runs.unearned.away}</span></>} sub={`${ctx.away.abbr} · ${ctx.home.abbr} scored`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <div>
          <Eyebrow>Defense</Eyebrow>
          {def.length ? <ul className="space-y-2">{def.map((e, i) => <Row key={i} e={e} ctx={ctx} />)}</ul> : <p className="text-[12px] font-sans italic text-stone-400 py-3">No errors, double plays or outfield assists in this game.</p>}
        </div>
        <div className="lg:pl-6">
          <Eyebrow>Run game</Eyebrow>
          {run.length ? <ul className="space-y-2">{run.map((e, i) => <Row key={i} e={e} ctx={ctx} />)}</ul> : <p className="text-[12px] font-sans italic text-stone-400 py-3">No steals, pickoffs, wild pitches, passed balls or balks in this game.</p>}
        </div>
      </div>
      <Foot>Errors are credited to the fielding club (throwing or fielding, per the official scorer&apos;s credit on the play); unearned runs are those the feed flags as team-unearned on an error play. Steal lines are tagged with the club that ran. Pickoffs listed are outs; pickoff errors count as errors.</Foot>
    </div>
  )
}
