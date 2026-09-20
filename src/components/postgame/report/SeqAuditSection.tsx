// src/components/postgame/report/SeqAuditSection.tsx
//
// Pro §14 Pitch sequencing audit — for each starter: how often the pitch after each pitch matched his
// usual top follow-up, against how often his own habits would match by chance ("expected"), and the
// row-by-row table: after pitch X, his usual next pitches vs what he threw tonight.

import { getPostData } from '@/lib/postgame/data'
import { getSeqAudit, MIN_FOLLOWED, type SeqStarter } from '@/lib/postgame/seqaudit'
import { pitchColor } from '@/lib/mlb'
import { Empty, Foot, Stat, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

const Chip = ({ code, children, on }: { code: string; children: React.ReactNode; on?: boolean }) => (
  <span className={`inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-0.5 border mr-1 mb-0.5 ${on ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200'}`}>
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: pitchColor(code) }} />{children}
  </span>
)

function Card({ s, ctx }: { s: SeqStarter; ctx: PostgameContext }) {
  const club = ctx[s.side]
  const act = s.pairs ? (s.matched / s.pairs) * 100 : 0, exp = s.pairs ? (s.expected / s.pairs) * 100 : 0
  const gap = act - exp
  const read = s.pairs < 20 ? `Only ${s.pairs} follow-up pitches, too few to compare.` : Math.abs(gap) < 5 ? `${s.name.split(' ').slice(-1)[0]} followed his usual patterns about as often as expected.` : gap > 0 ? `${s.name.split(' ').slice(-1)[0]} went to his usual follow-up more than his habits predict (+${gap.toFixed(0)} pts): more predictable than normal.` : `${s.name.split(' ').slice(-1)[0]} broke from his usual follow-ups more than expected (${gap.toFixed(0)} pts): less predictable than normal.`
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3.5">
      <p className="text-[13.5px] font-sans font-bold text-stone-900"><span style={{ color: SIDE_COLOR[s.side] }}>{club.abbr}</span> · {s.name}</p>
      <div className="grid grid-cols-3 gap-2 mt-2.5">
        <Stat label="Follow-ups" value={s.pairs} sub="pitch pairs in an at-bat" />
        <Stat label="Matched usual" value={`${act.toFixed(0)}%`} sub={`${s.matched} of ${s.pairs}`} />
        <Stat label="Expected" value={`${exp.toFixed(0)}%`} sub="if he stuck to habits" />
      </div>
      <p className="text-[12px] font-sans text-stone-700 leading-snug mt-2.5">{read}</p>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[11.5px] min-w-[420px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-left border-b border-stone-200"><th className="py-1">After</th><th>Usually next (season)</th><th>Tonight</th></tr></thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.from} className="border-b border-stone-100 last:border-0 align-top">
                <td className="py-1.5 font-sans font-semibold text-stone-800 whitespace-nowrap">{r.fromName} <span className="font-mono text-[9px] text-stone-400">×{r.n}</span></td>
                <td>{r.usual.map((u) => <Chip key={u.type} code={u.type}>{u.name} {Math.round(u.pct)}%</Chip>)}</td>
                <td>{r.tonight.map((t) => <Chip key={t.type} code={t.type} on={t.type === r.usual[0]?.type}>{t.name} {t.n}</Chip>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function SeqAuditSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const a = data ? await getSeqAudit(data, ctx.gameDate) : { starters: [], missing: [] }
  if (a.starters.length === 0) return <Empty>{a.missing.length ? `No season pitch-sequencing data is on file for ${a.missing.join(' or ')}.` : 'Pitch sequencing isn’t available for this game.'}</Empty>
  return (
    <div className="space-y-3">
      <div className="grid gap-4 lg:grid-cols-2">{a.starters.map((s) => <Card key={s.id} s={s} ctx={ctx} />)}</div>
      {a.missing.length > 0 && <p className="text-[11px] font-sans italic text-stone-400">No season sequencing data on file for {a.missing.join(', ')}.</p>}
      <Foot>Only consecutive pitches inside one plate appearance count. Usually next = the starter&apos;s season follow-up rates after each pitch type (rows with under {MIN_FOLLOWED} season examples are left out). Dark chip = tonight&apos;s pitch matched his most common follow-up. Expected = the match rate a pitcher who followed exactly those habits would have, so the gap shows whether he was more or less predictable than usual.</Foot>
    </div>
  )
}
