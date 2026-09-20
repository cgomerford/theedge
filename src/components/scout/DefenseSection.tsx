// src/components/scout/DefenseSection.tsx
//
// §6 Defense & alignment — each DEFENSE against the LINEUP it faces tonight:
//   · Alignment mix as shares of pitches (Standard / Strategic / Infield shade for
//     the infield; Standard / Strategic for the outfield), overall and by the
//     hitter's side of the plate — the full shift is banned, so this is the look
//     the club actually gives
//   · Schematic ballpark diagrams of what standard vs shaded looks like against
//     right- and left-handed hitters, and a matchup table of the opposing hitters
//     (pull side and rate, how this defense has aligned vs his side of the plate,
//     and vs him personally)
//   · A plain-language guide to the alignment terms (the shift ban, Standard /
//     Strategic / Infield shade) at the top of the section
//   · Tonight's fielders ranked by Outs Above Average, plus the club's OAA
// Shade direction is a convention (infielders move toward the pull side), not a
// measurement; shares under MIN_ALIGN_PITCHES are faded.

import { InfoButton } from '@/components/InfoButton'
import { getDefenseDesk, MIN_ALIGN_PITCHES, MIN_VS_HITTER, type DefenseDesk, type Tally } from '@/lib/scout/defense'
import { NEUTRAL, ShareBar, ShareLegend } from './charts/Atoms'
import LineChart, { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import type { ScoutClub, ScoutContext } from './types'

const IF_PARTS = [{ label: 'Standard', color: NEUTRAL }, { label: 'Strategic', color: CHART_BLUE }, { label: 'Infield shade', color: CHART_ORANGE }]
const OF_PARTS = [{ label: 'Standard', color: NEUTRAL }, { label: 'Strategic', color: CHART_BLUE }]
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const share = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{children}</p>
}

const ifBar = (label: string, t: Tally) => <ShareBar key={label} label={label} n={t.n} thin={t.n < MIN_ALIGN_PITCHES}
  parts={[{ label: 'Standard', value: t.ifStd, color: NEUTRAL }, { label: 'Strategic', value: t.ifStrat, color: CHART_BLUE }, { label: 'Infield shade', value: t.ifShade, color: CHART_ORANGE }]} />
const ofBar = (label: string, t: Tally) => <ShareBar key={label} label={label} n={t.n} thin={t.n < MIN_ALIGN_PITCHES}
  parts={[{ label: 'Standard', value: t.ofStd, color: NEUTRAL }, { label: 'Strategic', value: t.ofStrat, color: CHART_BLUE }]} />

// ─── The field ───────────────────────────────────────────────────────────
// A schematic INFIELD seen from behind home plate (first base on the right, third on
// the left), drawn to scale in feet from home plate: x toward right field, y toward
// center. Hollow dots are the standard fielding spots; when a defense shades the
// infield the four infielders move a few steps toward the hitter's PULL side (left
// for a right-handed hitter, right for a lefty) — filled dots with a line showing
// the move. Positions illustrate the convention; they are not tracked coordinates.
const FT = 1.2, OX = 150, OY = 206
const px = (x: number) => OX + x * FT
const py = (y: number) => OY - y * FT

const INFIELD = [
  { pos: '1B', x: 56, y: 88 }, { pos: '2B', x: 30, y: 134 }, { pos: 'SS', x: -30, y: 134 }, { pos: '3B', x: -56, y: 88 },
]
const SHADE_FT = 16

function AlignmentField({ side, t }: { side: 'R' | 'L'; t: Tally }) {
  const dir = side === 'R' ? -1 : 1                 // pull side: left of the picture for a righty
  const std = share(t.ifStd, t.n), strat = share(t.ifStrat, t.n), shade = share(t.ifShade, t.n)
  const thin = t.n < MIN_ALIGN_PITCHES
  const H = [px(0), py(0)], B1 = [px(63.6), py(63.6)], B2 = [px(0), py(127.3)], B3 = [px(-63.6), py(63.6)]
  const foulY = py(150)                              // where the 45° foul lines meet the frame
  const dot = 7
  return (
    <figure className={thin ? 'opacity-50' : ''}>
      <figcaption className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1">Against {side === 'R' ? 'right' : 'left'}-handed hitters</figcaption>
      <svg viewBox="0 0 300 222" className="w-full h-auto block rounded-lg" role="img"
        aria-label={`Infield alignment against ${side === 'R' ? 'right' : 'left'}-handed hitters: standard ${std}%, strategic ${strat}%, infield shade ${shade}% of pitches`}>
        <rect width="300" height="222" fill="#e7e5e4" />
        {/* fair territory: bounded by the two foul lines */}
        <path d={`M${H[0]} ${H[1]} L${px(-150)} ${foulY} L${px(-150)} 0 L${px(150)} 0 L${px(150)} ${foulY} Z`} fill="#e3ecd9" />
        {/* infield dirt: a 95 ft circle around the mound, then the grass diamond and bases */}
        <circle cx={px(0)} cy={py(60.5)} r={95 * FT} fill="#e6d6b8" />
        <path d={`M${H[0]} ${H[1]} L${B1[0]} ${B1[1]} L${B2[0]} ${B2[1]} L${B3[0]} ${B3[1]} Z`} fill="#e3ecd9" stroke="#fff" strokeWidth={1.5} />
        <path d={`M${H[0]} ${H[1]} L${px(-150)} ${foulY} M${H[0]} ${H[1]} L${px(150)} ${foulY}`} stroke="#fff" strokeWidth={1.5} />
        <circle cx={px(0)} cy={py(60.5)} r={4.5} fill="#cdb98f" />
        {[B1, B2, B3].map((bp, i) => <rect key={i} x={bp[0] - 4} y={bp[1] - 4} width={8} height={8} fill="#fff" stroke="#a8a29e" transform={`rotate(45 ${bp[0]} ${bp[1]})`} />)}
        <path d={`M${H[0] - 4} ${H[1] + 1} h8 v-4 l-4 -4 l-4 4 z`} fill="#fff" stroke="#a8a29e" />
        {/* the hitter, in the box on his side of the plate */}
        <circle cx={px(side === 'R' ? -8 : 8)} cy={py(-3)} r={5} fill="#57534e" />
        <text x={side === 'R' ? 8 : 292} y={14} textAnchor={side === 'R' ? 'start' : 'end'} fontSize={10} fill="#57534e" fontFamily="ui-monospace, monospace" fontWeight={700}>{side === 'R' ? '← pull side' : 'pull side →'}</text>
        {/* infielders: hollow = standard spot, orange = shaded spot */}
        {INFIELD.map((f) => {
          const sx = f.x + dir * SHADE_FT
          return (
            <g key={f.pos}>
              <line x1={px(f.x)} y1={py(f.y)} x2={px(sx)} y2={py(f.y)} stroke={CHART_ORANGE} strokeWidth={2} strokeDasharray="3 2" />
              <circle cx={px(f.x)} cy={py(f.y)} r={dot} fill="#fff" stroke="#57534e" strokeWidth={1.6} />
              <circle cx={px(sx)} cy={py(f.y)} r={dot} fill={CHART_ORANGE} stroke="#fff" strokeWidth={1.6}><title>{`${f.pos} — shaded toward the pull side`}</title></circle>
              <text x={px(f.x)} y={py(f.y) + 3} textAnchor="middle" fontSize={8} fill="#57534e" fontFamily="ui-monospace, monospace" fontWeight={700}>{f.pos}</text>
            </g>
          )
        })}
      </svg>
      <p className="text-[10.5px] font-sans text-stone-600 mt-1 leading-snug">
        <span className="font-mono font-bold" style={{ color: CHART_ORANGE }}>{shade ?? '—'}%</span> shade · <span className="font-mono font-bold" style={{ color: CHART_BLUE }}>{strat ?? '—'}%</span> strategic · <span className="font-mono font-bold text-stone-500">{std ?? '—'}%</span> standard
        <span className="text-stone-400"> · n={t.n}</span>
      </p>
    </figure>
  )
}

export function AlignmentGuide() {
  return (
    <details open className="rounded-xl border border-stone-200 bg-stone-50/70 px-3.5 py-3 text-[11.5px] font-sans text-stone-600 leading-relaxed">
      <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-widest text-stone-600 font-semibold">How to read defensive alignments</summary>
      <div className="mt-2 grid gap-x-6 gap-y-2 md:grid-cols-2 max-w-5xl">
        <p><span className="font-semibold text-stone-800">The shift is banned.</span> Since 2023 every infielder must start on the infield dirt, two on each side of second base. Old overshifts (a shortstop in right field) are gone — what&apos;s left is small, legal positioning choices, and that&apos;s what these charts measure.</p>
        <p><span className="font-semibold text-stone-800">Standard</span> is the ordinary set-up: fielders at their usual spots, nothing adjusted for this hitter or situation.</p>
        <p><span className="font-semibold text-stone-800" style={{ color: CHART_ORANGE }}>Infield shade</span> is the legal version of a shift: the infielders slide a few steps toward the hitter&apos;s <em>pull</em> side while still keeping two on each side of second. For a right-handed hitter that means toward third base; for a lefty, toward first. The diagrams below show the direction (the filled dots), not exact distances.</p>
        <p><span className="font-semibold text-stone-800" style={{ color: CHART_BLUE }}>Strategic</span> is Statcast&apos;s label for any other non-standard look — situational alignments such as infield in or guarding the lines, or tweaks built around one hitter. It doesn&apos;t say which way the fielders moved. The outfield only has Standard and Strategic.</p>
        <p><span className="font-semibold text-stone-800">Reading the numbers.</span> Every share is a share of <em>pitches</em> over roughly the last 40 days, split by which side of the plate the hitter stood on. A club that shades far more often against one side of the plate than the other is picking its spots. Small samples (under {MIN_ALIGN_PITCHES} pitches) are faded.</p>
        <p><span className="font-semibold text-stone-800">What it can&apos;t tell you.</span> The labels are Statcast&apos;s classification of each pitch — not tracked fielder coordinates — so the field drawings are schematic. &ldquo;vs him&rdquo; in the table is a handful of pitches at most; treat it as color, not a rule.</p>
      </div>
    </details>
  )
}

export function Matchup({ defense, offense, side, d }: { defense: ScoutClub; offense: ScoutClub; side: 'away' | 'home'; d: DefenseDesk | null }) {
  if (!d) return <div><ClubHeader club={defense} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Alignment data is unavailable for {defense.abbr} right now.</p></div>
  const a = d.alignment
  const trend = a.games.map((g) => share(g.ifStrat + g.ifShade, g.n))
  const rollN = 5
  const roll = trend.map((_, i) => {
    if (i < rollN - 1) return null
    const win = a.games.slice(i - rollN + 1, i + 1)
    return share(win.reduce((s, g) => s + g.ifStrat + g.ifShade, 0), win.reduce((s, g) => s + g.n, 0))
  })
  const first = rollN - 1
  return (
    <div className="space-y-5">
      <ClubHeader club={defense} side={side}><span className="text-[10px] font-mono text-stone-500">{defense.abbr} defense vs {offense.abbr}</span></ClubHeader>

      <section className="space-y-2.5">
        <Label>Infield alignment · share of pitches</Label>
        {ifBar('All hitters', a.all)}{ifBar('vs left-handed hitters', a.L)}{ifBar('vs right-handed hitters', a.R)}
        <ShareLegend parts={IF_PARTS} />
      </section>
      <section className="space-y-2.5">
        <Label>Outfield alignment · share of pitches</Label>
        {ofBar('All hitters', a.all)}{ofBar('vs left-handed hitters', a.L)}{ofBar('vs right-handed hitters', a.R)}
        <ShareLegend parts={OF_PARTS} />
      </section>
      <section>
        <Label>Non-standard infield looks per game · rolling 5</Label>
        <LineChart labels={a.games.slice(first).map((g) => shortDate(g.date))} series={[{ key: 't', label: 'Strategic + shade', color: CHART_BLUE, values: roll.slice(first) }]}
          baseline={{ value: share(a.all.ifStrat + a.all.ifShade, a.all.n), label: 'Period avg' }} format={(v) => `${v.toFixed(0)}%`} height={120} ariaLabel={`${defense.abbr} share of non-standard infield alignments`} />
      </section>

      <section>
        <Label>What the {defense.abbr} infield looks like</Label>
        <div className="grid grid-cols-2 gap-3">
          <AlignmentField side="R" t={a.R} />
          <AlignmentField side="L" t={a.L} />
        </div>
        <p className="text-[9.5px] font-mono text-stone-400 mt-1.5">Hollow dot = standard spot · orange dot and dashed line = where a shade moves the infielder · schematic infield to scale, viewed from behind home plate (outfield alignment is charted above).</p>
      </section>

      <section>
        <Label>{defense.abbr} vs the {offense.abbr} lineup</Label>
        <table className="w-full text-[11px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
            <th className="text-left font-semibold py-1">Hitter</th><th className="font-semibold">Pulls to</th><th className="font-semibold">Pull%</th><th className="font-semibold">Shade vs his side</th><th className="font-semibold">Shade vs him</th></tr></thead>
          <tbody>
            {d.matchup.map((h) => {
              const sideThin = h.vsSide.n < MIN_ALIGN_PITCHES, himThin = h.vsHim.n < MIN_VS_HITTER
              const sideShade = share(h.vsSide.ifShade, h.vsSide.n), himShade = share(h.vsHim.ifShade, h.vsHim.n)
              return (
                <tr key={h.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
                  <td className="text-left py-1 font-sans font-semibold">{h.order}. {h.name.split(' ').slice(-1)[0]} <span className="font-mono font-normal text-[9px] text-stone-400">{h.stand}{h.switchHitter ? ' (S)' : ''}</span></td>
                  <td className="font-mono text-stone-500">{h.stand === 'R' ? '3B side' : '1B side'}</td>
                  <td className={`font-mono ${h.pullPct == null ? 'text-stone-300' : ''}`}>{h.pullPct != null ? `${h.pullPct}%` : '—'}</td>
                  <td className={`font-mono ${sideThin ? 'text-stone-300' : ''}`}>{sideShade != null ? `${sideShade}%` : '—'}</td>
                  <td className={`font-mono ${himThin ? 'text-stone-300' : ''}`} title={himThin ? `${h.vsHim.n} pitches — too few to read` : `${h.vsHim.n} pitches`}>{himShade != null ? `${himShade}%` : '—'}<span className="text-[9px] text-stone-400"> {h.vsHim.n}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[9.5px] font-mono text-stone-300 mt-1.5">Shade = share of infield pitches with an Infield shade look, against hitters on his side of the plate and against him personally (small number = pitches; faded under {MIN_VS_HITTER}). Pull% = share of his balls in play hit to his pull side. A switch hitter is shown from the side he&apos;d bat against this starter.</p>
      </section>

      <section>
        <div className="flex items-center gap-1.5 mb-1.5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold">Tonight&apos;s fielders · Outs Above Average{d.team.oaa != null ? ` · club ${d.team.oaa > 0 ? '+' : ''}${d.team.oaa} (${d.team.rank}${ord(d.team.rank ?? 0)} of ${d.team.of})` : ''}</p>
          <InfoButton title="What is OAA?" align="left">
            <p className="mb-1.5"><b>Outs Above Average</b> counts how many more (or fewer) outs a fielder made than an average fielder would on the same balls, given how hard the ball was hit, where it went and how far he had to run. +5 is five extra outs over the season; −5 is five fewer.</p>
            <p className="mb-1.5"><b>Player vs club numbers.</b> Each fielder&apos;s number is his season total for every club he has played for. The club number is only the outs earned while wearing this club&apos;s uniform, so traded players make the two differ, and the fielders listed here won&apos;t add up to the club figure.</p>
            <p><b>Source.</b> Baseball Savant&apos;s OAA leaderboard, first through third base and the outfield. Catchers and pitchers aren&apos;t rated by OAA here. If another site shows a different club total, check whether it counts traded players by club or by season and which positions it includes.</p>
          </InfoButton>
        </div>
        <ul className="space-y-1">
          {d.fielders.map((f) => {
            const v = f.oaa, w = v == null ? 0 : Math.min(Math.abs(v), 12) / 12 * 50
            return (
              <li key={f.id} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-[11px] font-sans">
                <span className="truncate text-stone-700"><span className="font-mono text-[9px] text-stone-400 mr-1">{f.pos}</span>{f.name.split(' ').slice(-1)[0]}</span>
                <span className="relative h-2 rounded-[3px] bg-stone-100"><span className="absolute top-0 bottom-0 w-px bg-stone-400" style={{ left: '50%' }} />
                  {v != null && <span className="absolute top-0 bottom-0 rounded-[3px]" style={{ left: v >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 1)}%`, background: v >= 0 ? CHART_BLUE : CHART_ORANGE }} />}</span>
                <span className="font-mono text-[10px] text-stone-500 text-right">{v != null ? (v > 0 ? `+${v}` : v) : '—'}</span>
              </li>
            )
          })}
        </ul>
        {d.team.infield != null && <p className="text-[10px] font-mono text-stone-400 mt-1.5">Club OAA — infield {d.team.infield > 0 ? '+' : ''}{d.team.infield} · outfield {d.team.outfield != null && d.team.outfield > 0 ? '+' : ''}{d.team.outfield}</p>}
      </section>
    </div>
  )
}

function ord(n: number): string { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }

export default async function DefenseSection({ ctx }: { ctx: ScoutContext }) {
  const [awayDef, homeDef] = await Promise.all([
    getDefenseDesk(ctx.away.id, ctx.away.abbr, ctx.home.id, ctx.gameDate, ctx.gamePk, ctx.away.probableId).catch(() => null),
    getDefenseDesk(ctx.home.id, ctx.home.abbr, ctx.away.id, ctx.gameDate, ctx.gamePk, ctx.home.probableId).catch(() => null),
  ])
  return (
    <div className="space-y-4">
      <AlignmentGuide />
      <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <Matchup defense={ctx.away} offense={ctx.home} side="away" d={awayDef} />
        <div className="lg:pl-6"><Matchup defense={ctx.home} offense={ctx.away} side="home" d={homeDef} /></div>
      </div>
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Alignment: Baseball Savant pitch data for the last ~40 days, as shares of pitches (the full shift is banned, so this is Standard vs Strategic vs infield shade). Pull rates: season spray data. OAA: Baseball Savant. Shade direction is a convention — the infield moves toward the hitter&apos;s pull side — not a measured fielder position. This describes tendencies; it is not a prediction.
      </p>
    </div>
  )
}
