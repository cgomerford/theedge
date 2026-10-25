// src/components/admin/story-v5/remotion/scenes/extra.tsx
//
// Optional slides: the Scout Report slide (running game, or late and close) and the custom slide you type yourself.

import { useCurrentFrame } from 'remotion'
import { Count, ease, fmt3, sp } from '../anim'
import { MARGIN, TIMING } from '../config'
import { PITCH_COLOR } from '../../arsenal'
import { Headshot, NUM, Pill, Title, useOptBool, useOptNum, useTheme, useTitles } from '../ui'
import { teamColor } from './replay'
import type { PreviewData, ScoutLate, ScoutRun, Side } from '../../types'

export type ScoutTopic = 'run' | 'late'

// ── Scout Report: running game ────────────────────────────────────────────
function RunCard({ r, data, i, head, abs }: { r: ScoutRun; data: PreviewData; i: number; head: boolean; abs: boolean }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const T = TIMING.scout
  const team = data.teams[r.side]
  const d = T.first + i * T.step
  const s = sp(frame, d)
  return (
    <div style={{ width: 430, boxSizing: 'border-box', background: t.card, border: `2px solid ${t.line}`, borderRadius: 10, padding: 26, display: 'flex', flexDirection: 'column', gap: 14, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - Math.min(1, s)) * 30}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {head ? <Headshot src={r.headshot} size={104} border={teamColor(team, t.name)} badge={team.logo} /> : null}
        <div><div style={{ fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 700 }}>{team.abbr} CATCHER</div><div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05 }}>{r.catcher.split(' ').slice(-1)[0]}</div></div>
      </div>
      {r.pop != null ? <div><div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, color: t.accent, ...NUM }}><Count value={r.pop} from={d} frames={T.countFrames} fmt={n => n.toFixed(2)} /></div><div style={{ fontSize: 24, color: t.dim, fontWeight: 600 }}>POP TIME, SECONDS</div></div> : null}
      {r.csPct != null ? <div><div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, ...NUM }}><Count value={r.csPct} from={d} frames={T.countFrames} fmt={n => `${n.toFixed(1)}%`} /></div><div style={{ fontSize: 24, color: t.dim, fontWeight: 600 }}>CAUGHT STEALING{r.csOf != null ? `, ${r.csOf} TRIES` : ''}</div></div> : null}
      {r.attemptsPerGame != null ? <div style={{ fontSize: 26, color: t.dim, ...NUM }}>{r.attemptsPerGame.toFixed(2)} steal tries per game against</div> : null}
      {abs && r.abs ? <div style={{ fontSize: 26, color: t.dim, ...NUM }}>ABS: {r.abs.overturns} of {r.abs.challenges} overturned</div> : null}
    </div>
  )
}

// ── Scout Report: late and close ──────────────────────────────────────────
function LateCard({ l, data, i }: { l: ScoutLate; data: PreviewData; i: number }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const T = TIMING.scout
  const team = data.teams[l.side]
  const d = T.first + i * T.step
  const s = sp(frame, d)
  return (
    <div style={{ width: 430, boxSizing: 'border-box', background: t.card, border: `2px solid ${t.line}`, borderRadius: 10, padding: 26, display: 'flex', flexDirection: 'column', gap: 18, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - Math.min(1, s)) * 30}px)` }}>
      <div><Pill team={team} size={30} /></div>
      {l.rows.map((r, k) => (
        <div key={r.label}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: t.dim }}>{r.label}</span>
            <span style={{ fontSize: 56, fontWeight: 800, color: k === 0 ? t.accent : t.text, ...NUM }}><Count value={r.ops} from={d + k * 4} frames={T.countFrames} fmt={fmt3} /></span>
          </div>
          <div style={{ height: 14, background: t.line, borderRadius: 4 }}><div style={{ width: `${Math.min(1, r.ops / 1.2) * ease(frame, d + k * 4, d + k * 4 + T.countFrames) * 100}%`, height: '100%', background: k === 0 ? t.accent : t.bar, borderRadius: 4 }} /></div>
          <div style={{ fontSize: 22, color: t.dim, ...NUM }}>OPS, {r.pa} plate appearances</div>
        </div>
      ))}
      {l.oneRun ? <div style={{ fontSize: 30, fontWeight: 800, ...NUM }}>{l.oneRun.w} and {l.oneRun.l} in one-run games</div> : null}
    </div>
  )
}

export function ScoutScene({ data, topic }: { data: PreviewData; topic: ScoutTopic }) {
  const t = useTheme()
  const run = data.scout?.run ?? [], late = data.scout?.late ?? []
  const tt = useTitles('scout', data, { scoutTopic: topic })
  const oHead = useOptBool('scout', 'showHeadshot'), oAbs = useOptBool('scout', 'showAbs')
  return (
    <>
      <Title kicker={tt.kicker} head={tt.headline} />
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 340, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {topic === 'run' ? run.map((r, i) => <RunCard key={r.side} r={r} data={data} i={i} head={oHead} abs={oAbs} />) : late.map((l, i) => <LateCard key={l.side} l={l} data={data} i={i} />)}
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1064, fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 600 }}>FROM THE X9LAB SCOUT REPORT · {data.slateDate.slice(0, 4)} SEASON</div>
    </>
  )
}

// ── two arsenals side by side ─────────────────────────────────────────────
function ArsenalColumn({ data, side, i, maxUse, n, heads }: { data: PreviewData; side: Side; i: number; maxUse: number; n: number; heads: boolean }) {
  const frame = useCurrentFrame()
  const t = useTheme()
  const T = TIMING.compare
  const st = data.starters[side], team = data.teams[side]
  const shown = st.arsenal.slice(0, n)
  const best = Math.max(...shown.map(p => p.whiffPct ?? -1))
  const d0 = T.first + i * 3
  return (
    <div style={{ width: 430, boxSizing: 'border-box', background: t.card, border: `2px solid ${t.line}`, borderRadius: 10, padding: 22, display: 'flex', flexDirection: 'column', gap: 16, opacity: Math.min(1, sp(frame, d0) * 1.4) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {heads ? <Headshot src={st.headshot} size={84} border={teamColor(team, t.name)} badge={team.logo} /> : null}
        <div><div style={{ fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 700 }}>{team.abbr} STARTER</div><div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05 }}>{st.last}</div></div>
      </div>
      {shown.map((p, k) => {
        const d = d0 + k * T.step, isBest = p.whiffPct != null && p.whiffPct === best
        return (
          <div key={p.code}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 28, fontWeight: 700 }}>{p.name} <span style={{ color: t.dim, fontWeight: 600, ...NUM }}>{p.velo.toFixed(1)}</span></span>
              {p.whiffPct != null ? <span style={{ fontSize: 30, fontWeight: 800, color: isBest ? t.accent : t.text, ...NUM }}><Count value={p.whiffPct} from={d} frames={T.countFrames} fmt={n => `${n.toFixed(1)}%`} /></span> : null}
            </div>
            <div style={{ height: 16, background: t.line, borderRadius: 4, marginTop: 4 }}><div style={{ width: `${(p.usagePct / maxUse) * ease(frame, d, d + T.countFrames) * 100}%`, height: '100%', background: PITCH_COLOR[p.code] ?? t.accent, borderRadius: 4 }} /></div>
            <div style={{ fontSize: 20, color: t.dim, ...NUM }}>{p.usagePct.toFixed(1)}% of pitches{p.whiffPct != null ? ' · whiff on swings' : ''}</div>
          </div>
        )
      })}
    </div>
  )
}

export function CompareScene({ data }: { data: PreviewData }) {
  const t = useTheme()
  const tt = useTitles('compare', data)
  const n = useOptNum('compare', 'maxPitches'), heads = useOptBool('compare', 'showHeadshots')
  const maxUse = Math.max(...(['away', 'home'] as Side[]).flatMap(s => data.starters[s].arsenal.slice(0, n).map(p => p.usagePct)))
  return (
    <>
      <Title kicker={tt.kicker} head={tt.headline} />
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 340, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <ArsenalColumn data={data} side="away" i={0} maxUse={maxUse} n={n} heads={heads} /><ArsenalColumn data={data} side="home" i={1} maxUse={maxUse} n={n} heads={heads} />
      </div>
      <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: 1064, fontSize: 22, letterSpacing: 2, color: t.dim, fontWeight: 600 }}>{data.slateDate.slice(0, 4)} SEASON · BARS SHOW HOW OFTEN EACH PITCH IS THROWN</div>
    </>
  )
}
