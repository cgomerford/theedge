// src/components/postgame/report/BoxSection.tsx
//
// §4 Box score — batting and pitching lines for both clubs in tabs, and the full
// pitch-by-pitch log inside a collapsed <details> so nothing heavy paints on first load.

import { getPostData } from '@/lib/postgame/data'
import { buildBox, type BatRow, type PitRow, type Box } from '@/lib/postgame/recap'
import ClubHeader from '@/components/scout/ClubHeader'
import Tabs from '@/components/scout/Tabs'
import type { PostgameContext } from './types'

const surname = (full: string) => full.trim().split(/\s+/).slice(-1)[0]
const initial = (full: string) => { const p = full.trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : full }
const Th = ({ children, left }: { children: React.ReactNode; left?: boolean }) => <th className={`font-semibold py-1 ${left ? 'text-left' : ''}`}>{children}</th>
const head = 'text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200'

function BatTable({ rows }: { rows: BatRow[] }) {
  return (
    <table className="w-full text-[11.5px]">
      <thead><tr className={head}><Th left>Batter</Th><Th>AB</Th><Th>R</Th><Th>H</Th><Th>RBI</Th><Th>BB</Th><Th>SO</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
            <td className={`text-left py-1 font-sans ${r.sub ? 'pl-3 text-stone-600' : 'font-semibold'}`}>{initial(r.name)} <span className="font-mono text-[9px] text-stone-400">{r.pos}</span>{r.note && <span className="ml-1.5 font-mono text-[9px] text-orange-600">{r.note}</span>}</td>
            <td className="font-mono">{r.ab}</td><td className="font-mono">{r.r}</td><td className={`font-mono ${r.h > 0 ? 'font-bold text-stone-900' : ''}`}>{r.h}</td><td className="font-mono">{r.rbi}</td><td className="font-mono">{r.bb}</td><td className="font-mono">{r.so}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PitTable({ rows }: { rows: PitRow[] }) {
  return (
    <table className="w-full text-[11.5px]">
      <thead><tr className={head}><Th left>Pitcher</Th><Th>IP</Th><Th>H</Th><Th>R</Th><Th>ER</Th><Th>BB</Th><Th>K</Th><Th>HR</Th><Th>P-S</Th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
            <td className={`text-left py-1 font-sans ${i === 0 ? 'font-semibold' : 'pl-3'}`}>{initial(r.name)}{r.dec && <span className="ml-1.5 font-mono text-[9px] text-orange-600 font-bold">{r.dec}</span>}{i === 0 && <span className="ml-1.5 font-mono text-[9px] text-stone-400">SP</span>}</td>
            <td className="font-mono">{r.ip}</td><td className="font-mono">{r.h}</td><td className="font-mono">{r.r}</td><td className="font-mono">{r.er}</td><td className="font-mono">{r.bb}</td><td className="font-mono">{r.so}</td><td className="font-mono">{r.hr}</td>
            <td className="font-mono text-stone-500">{r.pitches ? `${r.pitches}-${r.strikes}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cols({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100"><div>{left}</div><div className="lg:pl-6">{right}</div></div>
}

function PitchLog({ box, ctx }: { box: Box; ctx: PostgameContext }) {
  return (
    <details className="group border border-stone-200 rounded-xl bg-white">
      <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between text-[12px] font-sans font-semibold text-stone-800 [&::-webkit-details-marker]:hidden">
        <span>Pitch-by-pitch log <span className="font-mono font-normal text-[10px] text-stone-400">· {box.pitchCount} pitches, {box.log.length} plate appearances</span></span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-orange-600 group-open:hidden">Show ↓</span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-orange-600 hidden group-open:inline">Hide ↑</span>
      </summary>
      <div className="border-t border-stone-100 max-h-[560px] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-stone-50"><tr className={head}><Th left>Inning</Th><Th left>Batter vs pitcher</Th><Th left>Pitches (type · mph · call)</Th><Th left>Result</Th></tr></thead>
          <tbody>
            {box.log.map((r) => (
              <tr key={r.atBat} className="border-b border-stone-100 align-top">
                <td className="py-1.5 pl-3 pr-2 font-mono text-[10px] text-stone-500 whitespace-nowrap">{r.top ? ctx.away.abbr : ctx.home.abbr} {r.top ? '▲' : '▼'}{r.inning}</td>
                <td className="py-1.5 pr-2 font-sans text-stone-700 whitespace-nowrap">{r.batter} <span className="text-stone-400">vs</span> {r.pitcher}</td>
                <td className="py-1.5 pr-2 font-mono text-[10px] text-stone-600 leading-relaxed">{r.pitches.map((p, i) => <span key={i} className="inline-block mr-2.5 whitespace-nowrap" title={`Count ${p.c}`}>{p.t} {p.v ?? ''} <span className="text-stone-400">{p.r.replace('Called Strike', 'Strike').replace('Swinging Strike', 'Swing miss').replace('In play, ', '')}</span></span>)}</td>
                <td className="py-1.5 pr-3 font-sans text-stone-700 whitespace-nowrap">{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export default async function BoxSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">The box score isn&apos;t available right now.</p>
  const box = buildBox(data)
  const hdr = (side: 'away' | 'home') => <ClubHeader club={{ ...ctx[side], probableId: null, probableName: null }} side={side} />
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'bat', label: 'Batting', content: <Cols left={<div>{hdr('away')}<BatTable rows={box.away.bat} /></div>} right={<div>{hdr('home')}<BatTable rows={box.home.bat} /></div>} /> },
        { id: 'pit', label: 'Pitching', content: <Cols left={<div>{hdr('away')}<PitTable rows={box.away.pit} /></div>} right={<div>{hdr('home')}<PitTable rows={box.home.pit} /></div>} /> },
      ]} />
      <PitchLog box={box} ctx={ctx} />
      <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">P-S = pitches thrown – strikes. W / L / S / H = win, loss, save, hold. {surname(data.feed.gameData.teams.away.name)} and {surname(data.feed.gameData.teams.home.name)} lines are from the official box score.</p>
    </div>
  )
}
