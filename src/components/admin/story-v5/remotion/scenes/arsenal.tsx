// src/components/admin/story-v5/remotion/scenes/arsenal.tsx
//
// Scene 3 (starter A arsenal) and scene 4 (starter B tunnel).
// Arsenal: up to 4 average pitch paths fly one after another; a card springs in under the zone as each lands (whiff counts up).
// Tunnel: the two main pitches fly together; a callout at the 30 ft point; then times-through-order bars cover the zone.

import { useCurrentFrame } from 'remotion'
import { PITCH_COLOR } from '../../arsenal'
import { project } from '../../trajectory'
import { Count, Flip, ease, fmt3, sp } from '../anim'
import { CatcherStage, type Flight } from '../catcher'
import { MARGIN, TIMING } from '../config'
import { Headshot, NUM, Title, useOptBool, useOptNum, useTheme, useTitles } from '../ui'
import type { ArsenalPitch, PreviewData, Side } from '../../types'

const colorOf = (code: string, fallback: string) => PITCH_COLOR[code] ?? fallback

function PitchCard({ p, delay, best, w = 430 }: { p: ArsenalPitch; delay: number; best: boolean; w?: number }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const s = sp(frame, delay)
  const color = colorOf(p.code, t.accent)
  return (
    <div style={{ width: w, boxSizing: 'border-box', background: t.card, border: `2px solid ${best ? t.accent : t.line}`, borderLeft: `10px solid ${color}`, borderRadius: 8, padding: '6px 16px', opacity: Math.min(1, s * 1.4), transform: `scale(${0.85 + 0.15 * Math.min(1.1, s)})` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 32, fontWeight: best ? 800 : 700, color: best ? t.accent : t.text }}>{p.name}</span>
        <span style={{ fontSize: 28, color: t.dim, ...NUM }}>{p.velo.toFixed(1)}</span>
      </div>
      <div style={{ fontSize: 24, color: t.dim, ...NUM }}>
        {p.usagePct.toFixed(1)}% use{p.whiffPct != null ? <> · <span style={{ color: best ? t.accent : t.text, fontWeight: best ? 800 : 600 }}><Count value={p.whiffPct} from={delay} frames={30} fmt={n => `${n.toFixed(1)}%`} /> whiff</span></> : null}
      </div>
    </div>
  )
}


export function ArsenalScene({ data, side = 'away' }: { data: PreviewData; side?: Side }) {
  const t = useTheme()
  const T = TIMING.arsenal
  const st = data.starters[side], team = data.teams[side]
  const oid = side === 'away' ? 'arsenal' : 'arsenalHome'
  const pitches = st.arsenal.slice(0, useOptNum(oid, 'maxPitches'))
  const showLine = useOptBool(oid, 'showLine'), showHead = useOptBool(oid, 'showHeadshot'), showCards = useOptBool(oid, 'showCards')
  const flights: Flight[] = pitches.map((p, i) => ({ points: p.path.points, color: colorOf(p.code, t.accent), start: T.firstPitch + i * T.gap, duration: T.flight }))
  const bestWhiff = Math.max(...pitches.map(p => p.whiffPct ?? -1))
  const L = st.line
  const tt = useTitles(side === 'away' ? 'arsenal' : 'arsenalHome', data)
  return (
    <>
      <CatcherStage flights={flights} />
      <Title kicker={tt.kicker} head={tt.headline} />
      {showHead ? <div style={{ position: 'absolute', left: MARGIN, top: 320 }}><Flip delay={6}><Headshot src={st.headshot} size={170} border={team.light === '#FFFFFF' ? team.primary : team.light} badge={team.logo} /></Flip></div> : null}
      {showLine ? <div style={{ position: 'absolute', right: MARGIN, top: 320, textAlign: 'right' }}>
        <Flip delay={8}><div style={{ fontSize: 24, letterSpacing: 3, color: t.dim, fontWeight: 700 }}>{L.label}</div></Flip>
        <Flip delay={12}><div style={{ fontSize: 48, fontWeight: 800, ...NUM }}>{L.ip.replace(/\.0$/, '')} IP · {L.er} ER</div></Flip>
        <Flip delay={16}><div style={{ fontSize: 36, fontWeight: 700, color: t.dim, ...NUM }}>{L.k} K · {L.bb} BB</div></Flip>
        <Flip delay={20}><div style={{ fontSize: 30, fontWeight: 800, color: t.accent, ...NUM }}>{L.bbRatePct.toFixed(1)}% BB RATE</div></Flip>
      </div> : null}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 836, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 24, letterSpacing: 2, color: t.dim, fontWeight: 600 }}>{data.slateDate.slice(0, 4)} AVERAGE PATHS · CATCHER VIEW</span>
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 878, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {showCards ? pitches.map((p, i) => <PitchCard key={p.code} p={p} delay={T.firstPitch + i * T.gap + T.flight} best={p.whiffPct != null && p.whiffPct === bestWhiff} />) : null}
      </div>
    </>
  )
}

export function TunnelScene({ data }: { data: PreviewData }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const T = TIMING.tunnel
  const side = data.tunnel.side, st = data.starters[side], team = data.teams[side]
  const { a, b, withinInchFt, apartInches, pointY } = data.tunnel.data
  const tt = useTitles('tunnel', data)
  const oCallout = useOptBool('tunnel', 'showCallout'), oBars = useOptBool('tunnel', 'showBars'), oHead = useOptBool('tunnel', 'showHeadshot'), oCards = useOptBool('tunnel', 'showCards')
  const flights: Flight[] = [a, b].map(p => ({ points: p.path.points, color: colorOf(p.code, t.accent), start: T.flyFrom, duration: T.flight }))
  // callout anchor: the point on pitch A's path closest to pointY feet from the plate frame
  const anchorPt = a.path.points.reduce((best, q) => (Math.abs(q.y - pointY) < Math.abs(best.y - pointY) ? q : best), a.path.points[0])
  const anchor = project(anchorPt)
  const showCallout = frame >= T.calloutFrom && frame < T.calloutTo
  const co = Math.min(ease(frame, T.calloutFrom, T.calloutFrom + 8), 1 - ease(frame, T.calloutTo - 8, T.calloutTo))
  const tto = st.tto
  const hi = Math.max(tto.first, tto.second)
  const barW = 560
  const panel = ease(frame, T.barsFrom, T.barsFrom + 8)
  const bars = [{ label: '1ST', v: tto.first, color: t.accent }, { label: '2ND', v: tto.second, color: t.bar }]
  return (
    <>
      <CatcherStage flights={flights} />
      <Title kicker={tt.kicker} head={tt.headline} />
      {oHead ? <div style={{ position: 'absolute', left: MARGIN, top: 320, opacity: oBars ? 1 - panel : 1 }}><Flip delay={6}><Headshot src={st.headshot} size={170} border={team.light === '#FFFFFF' ? team.primary : team.light} badge={team.logo} /></Flip></div> : null}
      {showCallout && oCallout ? (
        <div style={{ position: 'absolute', left: Math.min(anchor.x + 40, 1080 - MARGIN - 380), top: anchor.y - 40, width: 380, background: t.card, border: `2px solid ${t.accent}`, borderRadius: 8, padding: '10px 16px', opacity: co }}>
          {withinInchFt != null ? <div style={{ fontSize: 26, fontWeight: 700, ...NUM }}>within 1 inch until {withinInchFt} ft out</div> : null}
          <div style={{ fontSize: 26, fontWeight: 800, color: t.accent, ...NUM }}>{apartInches} inches apart at the plate</div>
        </div>
      ) : null}
      {oBars && frame >= T.barsFrom ? (
        <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 330, height: 510, background: t.card, border: `2px solid ${t.line}`, borderRadius: 10, padding: '34px 40px', boxSizing: 'border-box', opacity: panel, display: 'flex', flexDirection: 'column', gap: 30 }}>
          <div style={{ fontSize: 26, letterSpacing: 3, color: t.accent, fontWeight: 700 }}>xwOBA ALLOWED · TIMES THROUGH ORDER</div>
          {bars.map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <span style={{ width: 80, fontSize: 32, fontWeight: 700, color: t.dim }}>{r.label}</span>
              <div style={{ width: barW, height: 56, background: t.line, borderRadius: 4 }}><div style={{ width: `${(r.v / hi) * ease(frame, T.barsFrom + 4, T.barsDone) * 100}%`, height: '100%', background: r.color, borderRadius: 4 }} /></div>
              <span style={{ fontSize: 64, fontWeight: 800, ...NUM }}><Count value={r.v} from={T.barsFrom + 4} frames={T.barsDone - T.barsFrom - 4} fmt={fmt3} /></span>
            </div>
          ))}
          <div style={{ fontSize: 24, color: t.dim, ...NUM }}>{tto.paFirst} plate appearances the first time through, {tto.paSecond} the second. {data.slateDate.slice(0, 4)} season.</div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 878, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {oCards ? [a, b].map((p, i) => <PitchCard key={p.code} p={p} delay={T.flyFrom + T.flight + i * 4} best={false} />) : null}
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 836, display: 'flex', alignItems: 'center', gap: 16, opacity: !oBars || frame < T.barsFrom ? 1 : 0 }}>
        <span style={{ fontSize: 24, letterSpacing: 2, color: t.dim, fontWeight: 600 }}>{data.slateDate.slice(0, 4)} AVERAGE PATHS · CATCHER VIEW</span>
      </div>
    </>
  )
}
