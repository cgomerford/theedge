// src/components/postgame/ScorecardSheet.tsx
//
// The hand-scored scorecard for one club: the printed form in black, everything
// "written in" set in a handwriting face with small deterministic wobble so it reads as
// filled in by a person. Server component, pure SVG/CSS — no client JS.
// Layout follows the classic 10-inning card: header block, batting grid (order / name /
// pos / 10 innings / AB R H RBI), SUMS, pitchers, catchers, umpires.
// Notation conventions are explained on the sheet itself (see lib/postgame/scorecard.ts).

import { Outfit, Caveat } from 'next/font/google'
import type { Base, PlateAppearance, Scorecard, TeamSheet } from '@/lib/postgame/scorecard'

const hand = Caveat({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' })
const display = Outfit({ subsets: ['latin'], weight: ['800'], display: 'swap' })   // rounded brand face (was Bebas Neue — retired)

// Edge palette: cream paper, black printed form + pen, orange for hits / base paths / RBI, yellow for runs scored
const INK = '#1A1A1A'            // pen
const ORANGE = '#FF5722'
const YELLOW = '#FDE047'
const PRINT = '#1A1A1A'
const PAPER = '#FAF8F3'
const GRID = '#a9a598'
const COLS = 10                  // the card has ten inning columns
const CELL_W = 84, CELL_H = 96

// home, 1B, 2B, 3B laid out inside an 84×96 cell (home at the bottom)
const PT: Record<Base, [number, number]> = { 0: [48, 88], 1: [78, 58], 2: [48, 28], 3: [18, 58], 4: [48, 88] }

/** Small repeatable wobble so no two cells sit identically. */
function wob(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 2 * spread
}

function Written({ children, size, x, y, seed, anchor = 'middle', weight = 500, flip = false, color = INK }: { children: React.ReactNode; size: number; x: number; y: number; seed: number; anchor?: 'start' | 'middle' | 'end'; weight?: number; flip?: boolean; color?: string }) {
  const rot = wob(seed, 3)
  return (
    <text x={x + wob(seed + 1, 1.2)} y={y + wob(seed + 2, 1)} fontSize={size} fontWeight={weight} textAnchor={anchor} fill={color}
      transform={`rotate(${rot.toFixed(1)} ${x} ${y})${flip ? ` translate(${2 * x} 0) scale(-1 1)` : ''}`} className={hand.className}>{children}</text>
  )
}

function PaMark({ pa, seed, scale = 1, ox = 0, oy = 0 }: { pa: PlateAppearance; seed: number; scale?: number; ox?: number; oy?: number }) {
  const long = pa.notation.length > 3
  return (
    <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
      {/* the printed diamond */}
      <polygon points={`${PT[0]} ${PT[1]} ${PT[2]} ${PT[3]}`} fill={pa.scored ? 'rgba(253,224,71,.9)' : 'none'} stroke={pa.scored ? PRINT : GRID} strokeWidth={pa.scored ? 1 : 0.8} />
      {/* the path the runner took, in pen */}
      {pa.segs.map((s, i) => {
        // a move of several bases follows the base lines (home→1B→2B…), not a straight cut across the diamond
        const steps = Array.from({ length: Math.max(0, s.to - s.from) }, (_, k) => (s.from + k) as Base)
        const d = steps.map((b, k) => { const [ax, ay] = PT[b], [bx, by] = PT[(b + 1) as Base]; return `${k === 0 ? `M${ax} ${ay}` : ''} L${bx + wob(seed + i + k, 0.8)} ${by + wob(seed + i + k + 9, 0.8)}` }).join(' ')
        const [lx, ly] = PT[s.to === s.from ? s.from : s.to]
        return (
          <g key={i}>
            {steps.length > 0 && <path d={d} stroke={ORANGE} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            {s.label && <Written size={9.5} x={lx + (lx > 48 ? 3 : lx < 48 ? -3 : 9)} y={ly + (ly > 60 ? -9 : 3)} seed={seed + i + 30} weight={700}>{s.label}</Written>}
          </g>
        )
      })}
      {/* the result */}
      <Written size={long ? 19 : 25} x={48} y={long ? 62 : 66} seed={seed} weight={700} flip={pa.looking && pa.notation === 'K'} color={pa.hit ? ORANGE : INK}>{pa.notation}</Written>
      {pa.note && <Written size={11} x={48} y={77} seed={seed + 4} weight={500}>{pa.note}</Written>}
      {/* out number, circled */}
      {pa.outNum != null && (
        <g>
          <circle cx={pa.outAt ? PT[pa.outAt][0] + (pa.outAt === 1 ? 2 : pa.outAt === 3 ? -2 : 0) : 70} cy={pa.outAt ? PT[pa.outAt][1] - (pa.outAt === 2 ? 8 : 0) : 12} r={7.5} fill="none" stroke={INK} strokeWidth={1.4} />
          <Written size={11} x={pa.outAt ? PT[pa.outAt][0] + (pa.outAt === 1 ? 2 : pa.outAt === 3 ? -2 : 0) : 70} y={(pa.outAt ? PT[pa.outAt][1] - (pa.outAt === 2 ? 8 : 0) : 12) + 3.6} seed={seed + 6} weight={700}>{pa.outNum}</Written>
        </g>
      )}
      {/* RBI dots */}
      {Array.from({ length: Math.min(pa.rbi, 4) }, (_, i) => <circle key={i} cx={8 + i * 7} cy={90} r={2.6} fill={ORANGE} stroke={PRINT} strokeWidth={0.6} />)}
    </g>
  )
}

/** The little ball/strike tally in the corner of each box. */
function Tally({ pa }: { pa: PlateAppearance }) {
  const dots = (n: number, y: number, filled: boolean) => Array.from({ length: n }, (_, i) => <circle key={`${y}${i}`} cx={5 + i * 7} cy={y} r={2.2} fill={filled ? GRID : 'none'} stroke={GRID} strokeWidth={0.9} />)
  return <g>{dots(pa.balls, 6, false)}{dots(pa.strikes, 15, true)}</g>
}

function Cell({ pas, seedBase }: { pas: PlateAppearance[]; seedBase: number }) {
  return (
    <svg width={CELL_W} height={CELL_H} viewBox={`0 0 ${CELL_W} ${CELL_H}`} style={{ display: 'block' }}>
      {pas.length === 0 && <polygon points={`${PT[0]} ${PT[1]} ${PT[2]} ${PT[3]}`} fill="none" stroke="#dcdad2" strokeWidth={0.8} />}
      {pas.length === 1 && <><Tally pa={pas[0]} /><PaMark pa={pas[0]} seed={seedBase} />{pas[0].sub > 0 && <Written x={54} y={12} size={14} seed={seedBase + 50} weight={700}>{String.fromCharCode(96 + pas[0].sub)}</Written>}</>}
      {pas.length > 1 && pas.slice(0, 2).map((pa, i) => <PaMark key={pa.atBat} pa={pa} seed={seedBase + i * 7} scale={0.62} ox={i === 0 ? -6 : 34} oy={i === 0 ? 10 : 22} />)}
    </svg>
  )
}

const frame = (extra?: React.CSSProperties): React.CSSProperties => ({ border: `1px solid ${PRINT}`, ...extra })
const label: React.CSSProperties = { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: PRINT }

function Field({ name, children, flex = 1 }: { name: string; children?: React.ReactNode; flex?: number }) {
  return (
    <div style={{ ...frame({ borderWidth: '0 1px 1px 0' }), flex, padding: '2px 6px', display: 'flex', alignItems: 'baseline', gap: 6, minHeight: 26 }}>
      <span style={label}>{name}</span><span className={hand.className} style={{ color: INK, fontSize: 19, fontWeight: 500 }}>{children}</span>
    </div>
  )
}

function Written2({ children, size = 18, weight = 500 }: { children: React.ReactNode; size?: number; weight?: number }) {
  return <span className={hand.className} style={{ color: INK, fontSize: size, fontWeight: weight }}>{children}</span>
}

export function ScorecardSheet({ sc, team, opp, visitor }: { sc: Scorecard; team: TeamSheet; opp: TeamSheet; visitor: boolean }) {
  const head = (n: number) => `${n}`
  const gridCols = `28px 168px 46px repeat(${COLS}, ${CELL_W}px) 34px 34px 34px 38px`
  const seedRoot = team.teamId * 7
  return (
    <section style={{ background: PAPER, padding: 22, width: 'fit-content', boxShadow: '0 1px 0 #d8d4c8, 0 14px 40px rgba(0,0,0,.12)', color: PRINT }}>
      <div style={{ background: PRINT, color: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', margin: '-22px -22px 14px', borderBottom: `4px solid ${ORANGE}` }}>
        <span className={display.className} style={{ fontSize: 28, fontWeight: 800, letterSpacing: '.02em', lineHeight: 1 }}>THE <span style={{ color: ORANGE }}>EDGE</span> · SCORECARD</span>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: YELLOW }}>⊕ {team.name} batting</span>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, letterSpacing: '.08em', opacity: .75 }}>edgereportdaily.com</span>
      </div>

      {/* header block */}
      <div style={{ ...frame({ borderWidth: '1px 0 0 1px' }), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex' }}>
          <Field name="Notes:" flex={3}>{sc.notes}</Field><Field name="Start Time:">{sc.startTime}</Field><Field name="Attendance:">{sc.attendance?.toLocaleString()}</Field>
        </div>
        <div style={{ display: 'flex' }}>
          <Field name={`${visitor ? '☒' : '☐'} Visitor:`} flex={1.5}>{visitor ? team.name : opp.name}</Field><Field name="Date:">{sc.date}</Field><Field name="End Time:">{sc.endTime}</Field><Field name="Wind:">{sc.wind}</Field>
        </div>
        <div style={{ display: 'flex' }}>
          <Field name={`${visitor ? '☐' : '☒'} Home:`} flex={1.5}>{visitor ? opp.name : team.name}</Field><Field name="Scorer:">The Edge</Field><Field name="Time of Game:">{sc.timeOfGame}</Field><Field name="Weather:">{sc.weather}</Field>
        </div>
      </div>

      {/* batting grid */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, ...label, fontSize: 10.5, background: PRINT, color: PAPER, textAlign: 'center', lineHeight: '20px' }}>
          <span>#</span><span>Line Up</span><span>Pos</span>
          {Array.from({ length: COLS }, (_, i) => <span key={i} style={{ color: i + 1 > sc.innings ? '#77736a' : PAPER }}>{head(i + 1)}</span>)}
          {['AB', 'R', 'H', 'RBI'].map((h) => <span key={h} style={{ color: YELLOW }}>{h}</span>)}
        </div>
        {team.slots.map((slot) => (
          <div key={slot.slot} style={{ display: 'grid', gridTemplateColumns: gridCols, height: CELL_H, borderBottom: `1.5px solid ${PRINT}` }}>
            <div style={{ ...frame({ borderWidth: '0 1px 0 1px' }), ...label, textAlign: 'center', paddingTop: 4 }}>{slot.slot}</div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', padding: '0 5px', borderRight: `1px solid ${PRINT}` }}>
              {[0, 1, 2, 3].map((i) => <div key={i} style={{ borderBottom: `1px solid ${GRID}`, height: 22, lineHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden' }}><Written2 size={18} weight={i === 0 ? 700 : 500}>{slot.players[i] ? `${i > 0 ? `${String.fromCharCode(96 + i)} ` : ''}${slot.players[i].name}` : ''}</Written2></div>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', padding: '0 3px', borderRight: `1px solid ${PRINT}`, textAlign: 'center' }}>
              {[0, 1, 2, 3].map((i) => <div key={i} style={{ borderBottom: `1px solid ${GRID}`, height: 22, lineHeight: '22px', whiteSpace: 'nowrap', overflow: 'hidden' }}><Written2 size={14}>{slot.players[i]?.pos ?? ''}</Written2></div>)}
            </div>
            {Array.from({ length: COLS }, (_, i) => (
              <div key={i} style={{ borderRight: `1px solid ${PRINT}`, background: i >= sc.innings ? 'transparent' : undefined }}>
                <Cell pas={team.cells[`${slot.slot}-${i + 1}`] ?? []} seedBase={seedRoot + slot.slot * 31 + i * 5} />
              </div>
            ))}
            {[slot.ab, slot.r, slot.h, slot.rbi].map((v, i) => <div key={i} style={{ borderRight: `1px solid ${PRINT}`, textAlign: 'center', paddingTop: 30, background: i === 1 && v > 0 ? YELLOW : undefined }}><Written2 size={22} weight={700}>{v || (i === 0 && slot.players.length ? 0 : v)}</Written2></div>)}
          </div>
        ))}
      </div>

      {/* SUMS */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: `28px 168px 46px repeat(${COLS}, ${CELL_W}px)`, width: 'fit-content' }}>
        {([['Runs', team.sums.runs], ['Hits', team.sums.hits], ['Errors', team.sums.errors], ['Left on Base', team.sums.lob]] as [string, number[]][]).map(([name, vals], r) => (
          <div key={name} style={{ display: 'contents' }}>
            <div style={{ ...frame({ borderWidth: '1px 1px 1px 1px' }), ...label, textAlign: 'center', fontSize: 10 }}>{['S', 'U', 'M', 'S'][r]}</div>
            <div style={{ ...frame({ borderWidth: '1px 1px 1px 0' }), ...label, textAlign: 'right', padding: '2px 6px' }}>{name}{name === 'Errors' ? ' (by opp.)' : ''}</div>
            <div style={frame({ borderWidth: '1px 1px 1px 0' })} />
            {Array.from({ length: COLS }, (_, i) => <div key={i} style={{ ...frame({ borderWidth: '1px 1px 1px 0' }), textAlign: 'center', height: 24, background: name === 'Runs' && (vals[i] ?? 0) > 0 && i < sc.innings ? YELLOW : undefined }}>{i < sc.innings && vals[i] != null ? <Written2 size={19} weight={700}>{vals[i]}</Written2> : null}</div>)}
          </div>
        ))}
      </div>

      {/* pitchers */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '28px 210px repeat(11, 62px)', width: 'fit-content', ...label }}>
        {['#', 'Pitchers', 'W/L/S', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HB', 'BK', 'WP', 'TBF'].map((h, i) => <div key={h} style={{ ...frame({ borderWidth: '1px 1px 1px 0' }), background: PRINT, color: PAPER, textAlign: 'center', fontSize: 10.5, borderLeftWidth: i === 0 ? 1 : 0 }}>{h}</div>)}
        {sc[team.side === 'away' ? 'home' : 'away'].pitchers.map((p, idx) => (
          <div key={p.id} style={{ display: 'contents' }}>
            {[String(idx + 1), p.name, p.dec ?? '', p.ip, p.h, p.r, p.er, p.bb, p.so, p.hb, p.bk, p.wp, p.tbf].map((v, i) => (
              <div key={i} style={{ ...frame({ borderWidth: '0 1px 1px 0' }), borderLeftWidth: i === 0 ? 1 : 0, textAlign: i === 1 ? 'left' : 'center', padding: '0 5px', height: 24, lineHeight: '24px', whiteSpace: 'nowrap', overflow: 'hidden' }}><Written2 size={18}>{v}</Written2></div>
            ))}
          </div>
        ))}
      </div>
      <p style={{ ...label, fontSize: 9.5, color: '#6b675c', margin: '3px 0 0' }}>Pitchers listed are {opp.name}&apos;s — the staff {team.abbr} batted against.</p>

      {/* catchers + umpires + key */}
      <div style={{ marginTop: 12, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 140px 50px', ...label }}>
          {['#', 'Catchers', 'PB'].map((h, i) => <div key={h} style={{ ...frame({ borderWidth: '1px 1px 1px 0' }), background: PRINT, color: PAPER, borderLeftWidth: i === 0 ? 1 : 0, textAlign: 'center', fontSize: 10.5 }}>{h}</div>)}
          {team.catchers.map((c, i) => <div key={c.name} style={{ display: 'contents' }}>{[String(i + 1), c.name, String(c.pb)].map((v, j) => <div key={j} style={{ ...frame({ borderWidth: '0 1px 1px 0' }), borderLeftWidth: j === 0 ? 1 : 0, padding: '0 5px', height: 24, lineHeight: '24px', textAlign: j === 1 ? 'left' : 'center' }}><Written2 size={17}>{v}</Written2></div>)}</div>)}
        </div>
        <div style={{ ...frame(), ...label, width: 250 }}>
          <div style={{ padding: '2px 6px', borderBottom: `1px solid ${PRINT}` }}>Umpires</div>
          {([['HP', sc.umpires.hp], ['1B', sc.umpires.b1], ['2B', sc.umpires.b2], ['3B', sc.umpires.b3]] as const).map(([k, v]) => <div key={k} style={{ padding: '0 6px', display: 'flex', gap: 6, borderBottom: `1px solid ${GRID}`, height: 22, alignItems: 'baseline' }}><span>{k}:</span><Written2 size={17}>{v}</Written2></div>)}
        </div>
        <p style={{ ...label, fontSize: 10, color: '#6b675c', maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
          <b>How to read it.</b>{' '}Fielders are numbered 1 P · 2 C · 3 1B · 4 2B · 5 3B · 6 SS · 7 LF · 8 CF · 9 RF. 6-3 = shortstop to first · F8 fly to centre · L6 line drive to short · P4 pop-up · U = unassisted · K swinging, backwards K looking · BB walk · HBP hit by pitch · E6 error on the shortstop · FC fielder&apos;s choice · DP double play · SF sacrifice fly. The circled number is the out of the inning; a shaded diamond means the runner scored; dots are RBI. Pen lines follow the runner round the bases; SB/WP/PB/BK/CS mark how he moved. A small letter (a, b) in a box means that substitute batted. Scored from the MLB game feed.
        </p>
      </div>
    </section>
  )
}

export default function ScorecardPair({ sc }: { sc: Scorecard }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36, alignItems: 'center' }}>
      <ScorecardSheet sc={sc} team={sc.away} opp={sc.home} visitor />
      <ScorecardSheet sc={sc} team={sc.home} opp={sc.away} visitor={false} />
    </div>
  )
}
