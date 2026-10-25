// src/components/admin/story-v5/remotion/scenes/defense.tsx
//
// Scene 5 (defense, OAA on a field) and scene 6 (bullpens) and scene 7 (outro).

import { useCurrentFrame } from 'remotion'
import { Count, Flip, ease, signed, sp } from '../anim'
import { MARGIN, TIMING } from '../config'
import { Headshot, NUM, Pill, Title, useOptBool, useOptNum, useTheme, useTitles } from '../ui'
import { firstPitchTimes } from '../time'
import { teamColor } from './replay'
import type { DefenseSide, Fielder, PreviewData, Side, TeamInfo } from '../../types'

export type DefenseMode = Side | 'both'
export type BullpenMode = 'lastGame' | 'last3'

// Positions as multiples of d (home to second base), from home plate: [right of centre, up the field].
const SPOT: Record<string, [number, number]> = { '1B': [0.72, 0.44], '2B': [0.28, 0.86], '3B': [-0.72, 0.44], SS: [-0.28, 0.86], LF: [-0.95, 1.36], CF: [0, 1.82], RF: [0.95, 1.36] }

function oaaColor(f: Fielder, accent: string, text: string, negative: string) { return f.oaa >= 7 ? accent : f.oaa < 0 ? negative : text }

function FieldGraphic({ side, data, cx, scale, heads }: { side: DefenseSide; data: PreviewData; cx: number; scale: number; heads: boolean }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const T = TIMING.defense
  const hy = 1060, d = 370 * scale, R = d * 1.95, k = Math.SQRT1_2
  const team = data.teams[side.side]
  return (
    <>
      <svg width={1080} height={1350} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={`M ${cx} ${hy} L ${cx - R * k} ${hy - R * k} A ${R} ${R} 0 0 1 ${cx + R * k} ${hy - R * k} Z`} fill="#3E8E5A" fillOpacity={t.name === 'dark' ? 0.16 : 0.14} stroke={t.text} strokeOpacity={0.15} strokeWidth={2} />
        <polygon points={`${cx},${hy} ${cx + d * 0.707},${hy - d * 0.707} ${cx},${hy - d * 1.414} ${cx - d * 0.707},${hy - d * 0.707}`} fill={t.text} fillOpacity={0.05} stroke={t.text} strokeOpacity={0.3} strokeWidth={3} />
        {[[d * 0.707, d * 0.707], [0, d * 1.414], [-d * 0.707, d * 0.707]].map(([x, y], i) => <rect key={i} x={cx + x - 12} y={hy - y - 12} width={24} height={24} fill={t.card} stroke={t.text} strokeWidth={3} transform={`rotate(45 ${cx + x} ${hy - y})`} />)}
      </svg>
      {side.fielders.map((f, i) => {
        const [ux, uy] = SPOT[f.pos]
        const x = cx + ux * d, y = hy - uy * d
        const s = sp(frame, T.first + i * T.step)
        const sz = 74 * Math.max(0.7, scale)
        return (
          <div key={f.pos} style={{ position: 'absolute', left: x - 110 * scale, top: y - 70 * scale, width: 220 * scale, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: Math.min(1, s * 1.4), transform: `scale(${0.6 + 0.4 * Math.min(1.08, s)})` }}>
            <div style={{ fontSize: 64 * Math.max(0.65, scale), fontWeight: 800, lineHeight: 1, color: oaaColor(f, t.accent, t.text, t.negative), ...NUM }}>
              <Count value={f.oaa} from={T.first + i * T.step} frames={T.countFrames} fmt={n => signed(Math.round(n))} />
            </div>
            {heads ? <div style={{ marginTop: 4 }}><Headshot src={f.headshot} size={sz} border={teamColorFor(team, t.name)} /></div> : null}
            <div style={{ marginTop: 4, fontSize: 28 * Math.max(0.75, scale), fontWeight: 700, whiteSpace: 'nowrap' }}>{f.pos} {f.last}{f.offPosition ? '*' : ''}</div>
          </div>
        )
      })}
    </>
  )
}
const teamColorFor = (team: TeamInfo, theme: string) => teamColor(team, theme)

export function DefenseScene({ data, mode = 'home', id = 'defense' }: { data: PreviewData; mode?: DefenseMode; id?: 'defense' | 'defenseAway' }) {
  const t = useTheme()
  const tt = useTitles(id, data, { defenseMode: mode })
  const oPills = useOptBool(id, 'showPills'), oHeads = useOptBool(id, 'showHeadshots'), oNotes = useOptBool(id, 'showNotes')
  const sides: Side[] = mode === 'both' ? ['away', 'home'] : [mode]
  const main = data.defense[sides[sides.length - 1]]
  const notes = [...new Set(sides.flatMap(s => data.defense[s].footnotes))]
  const label = [`${main.lineupConfirmed ? 'CONFIRMED' : 'UNCONFIRMED'} ALIGNMENT`, `${data.slateDate.slice(0, 4)} SEASON OAA`]
  return (
    <>
      <Title kicker={tt.kicker} head={tt.headline} />
      {oPills ? <div style={{ position: 'absolute', right: MARGIN, top: 330, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
        {(['home', 'away'] as Side[]).map((s, i) => <Flip key={s} delay={8 + i * 4}><Pill team={data.teams[s]} label={`${data.teams[s].abbr} TEAM ${signed(data.defense[s].teamOaa)}`} size={26} /></Flip>)}
      </div> : null}
      <div style={{ position: 'absolute', left: MARGIN, top: 336, width: 300, fontSize: 24, lineHeight: 1.25, letterSpacing: 2, color: t.dim, fontWeight: 600 }}>{label[0]}<br />{label[1]}</div>
      {sides.map((s, i) => <FieldGraphic key={s} side={data.defense[s]} data={data} cx={mode === 'both' ? (i === 0 ? 270 : 810) : 540} scale={mode === 'both' ? 0.5 : 1} heads={oHeads} />)}
      {oNotes && notes.length ? <div style={{ position: 'absolute', left: MARGIN, top: 1084, fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 600 }}>{notes.join('   ')}</div> : null}
    </>
  )
}

// ── bullpens ──────────────────────────────────────────────────────────────
const fitSize = (text: string, width: number, max: number, min = 22) => Math.max(min, Math.min(max, Math.floor(width / (text.length * 0.54))))

type Row = { id: number; last: string; headshot: string; team: TeamInfo; n: number; note: string | null; muted: boolean }

export function BullpenScene({ data, mode = 'lastGame' }: { data: PreviewData; mode?: BullpenMode }) {
  const frame = useCurrentFrame()
  const tt = useTitles('bullpen', data, { bullpenMode: mode })
  const oRows = useOptNum('bullpen', 'maxRows'), oHeads = useOptBool('bullpen', 'showHeadshots'), oClosing = useOptBool('bullpen', 'showClosing')
  const t = useTheme()
  const T = TIMING.bullpen
  const bp = data.bullpens
  const allRows: Row[] = mode === 'lastGame'
    ? (['away', 'home'] as Side[]).flatMap(s => bp.lastGame[s].map(a => ({ id: a.id, last: a.last, headshot: a.headshot, team: data.teams[s], n: a.pitches, note: null, muted: false })))
    : (['away', 'home'] as Side[]).flatMap(s => bp.last3[s].filter(a => a.p3 > 0 || a.daysRest != null).slice(0, 5).map(a => ({ id: a.id, last: a.last, headshot: a.headshot, team: data.teams[s], n: a.p3, note: a.daysRest == null ? '10+ days rest' : `${a.daysRest} days rest`, muted: a.likelyUnavailable })))
  const keep = new Set([...allRows].sort((a, b) => b.n - a.n).slice(0, oRows).map(r => r.id))
  const rows = allRows.filter(r => keep.has(r.id))
  const top = Math.max(...rows.map(r => r.n))
  const px = Math.min(15, 330 / Math.max(top, 1))
  const rowH = rows.length > 8 ? 80 : 92
  return (
    <>
      <Title kicker={tt.kicker} head={tt.headline} />
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 330, display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => {
          const delay = T.first + i * T.step
          const s = sp(frame, delay)
          const best = r.n === top && !r.muted
          return (
            <div key={r.id} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 16, opacity: Math.min(1, s * 1.4) * (r.muted ? 0.4 : 1) }}>
              <div style={{ width: 118 }}><Pill team={r.team} size={24} /></div>
              {oHeads ? <Headshot src={r.headshot} size={60} border={teamColor(r.team, t.name)} /> : null}
              <div style={{ width: 190, fontSize: fitSize(r.last, 190, 34), fontWeight: best ? 800 : 700, whiteSpace: 'nowrap' }}>{r.last}</div>
              <div style={{ width: Math.max(0, r.n * px * ease(frame, delay, delay + 18)), height: 34, background: best ? t.accent : t.bar, borderRadius: 4 }} />
              <div style={{ fontSize: 44, fontWeight: best ? 800 : 700, color: best ? t.accent : t.text, ...NUM }}><Count value={r.n} from={delay} frames={T.countFrames} /></div>
              {r.note ? <div style={{ fontSize: 24, color: t.dim, fontWeight: 600 }}>{r.note}{r.muted ? ' · likely unavailable' : ''}</div> : null}
            </div>
          )
        })}
      </div>
      {mode === 'lastGame' && oClosing ? <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 330 + rows.length * rowH + 20, fontSize: 32, fontWeight: 700, color: t.dim, opacity: ease(frame, 50, 62) }}>{tt.extra}</div> : null}
    </>
  )
}

// ── outro ─────────────────────────────────────────────────────────────────
export function OutroScene({ data }: { data: PreviewData }) {
  const t = useTheme()
  const tt = useTitles('outro', data)
  const oMatch = useOptBool('outro', 'showMatchup'), oHeads = useOptBool('outro', 'showHeadshots'), oTime = useOptBool('outro', 'showTime'), oButton = useOptBool('outro', 'showButton')
  const a = data.starters.away, h = data.starters.home
  return (
    <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 180, bottom: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, textAlign: 'center' }}>
      {oMatch ? <Flip delay={0}><div style={{ display: 'flex', alignItems: 'center', gap: 22 }}><Pill team={data.teams.away} size={56} /><span style={{ fontSize: 40, color: t.dim, fontWeight: 700 }}>at</span><Pill team={data.teams.home} size={56} /></div></Flip> : null}
      <Flip delay={5}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
          {oHeads ? <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <Headshot src={a.headshot} size={170} border={teamColor(data.teams.away, t.name)} />
            <span style={{ fontSize: 36, fontWeight: 700, color: t.dim }}>vs</span>
            <Headshot src={h.headshot} size={170} border={teamColor(data.teams.home, t.name)} />
          </div> : null}
          <div style={{ fontSize: fitSize(tt.headline, 880, 76, 40), fontWeight: 800, letterSpacing: -1, whiteSpace: 'nowrap' }}>{tt.headline}</div>
        </div>
      </Flip>
      {oTime ? <Flip delay={10}><div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 2, color: t.accent }}>{firstPitchTimes(data.firstPitch.iso)?.line}</div></Flip> : null}
      {oButton ? <Flip delay={15}><div style={{ fontSize: 40, fontWeight: 800, border: `3px solid ${t.accent}`, borderRadius: 999, padding: '14px 44px' }}>{tt.extra}</div></Flip> : null}
    </div>
  )
}
