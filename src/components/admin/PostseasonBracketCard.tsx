'use client'

// src/components/admin/PostseasonBracketCard.tsx
//
// The FULL postseason bracket in one landscape (1600x900) X graphic — Wild
// Card through World Series, AL on top / NL on bottom, converging to a
// centered World Series slot, connected with classic bracket elbow lines.
// Purely presentational and fully manual: George assembles all 11 slots by
// hand in PostseasonBracketBuilder.tsx (team + seed + an optional status
// line like "NYY leads 1-0") and re-exports the whole bracket as rounds
// progress. No live standings/results are pulled — an unfilled slot renders
// a dashed placeholder, never a fabricated matchup.
//
// Own small stylesheet rather than ScoutGraphicCard's cardCss (that one is
// hard-coded portrait 1080x1350). Same design tokens: C/SANS/MONO from
// components/team/ui.tsx (Outfit headers/bold, JetBrains Mono light labels,
// cream/orange — DESIGN_SYSTEM.md; Bebas/Fraunces are retired, not used here).

import { forwardRef } from 'react'
import { C, SANS, MONO } from '@/components/team/ui'
import { teamLogoUrl } from '@/lib/mlb'

export type BracketTeam = {
  teamId: number | null
  name: string | null
  abbrev: string | null
  color: string | null
  seed: number | null
}

export type BracketMatchup = {
  label: string
  teamA: BracketTeam
  teamB: BracketTeam
  status: string
}

export const EMPTY_TEAM: BracketTeam = { teamId: null, name: null, abbrev: null, color: null, seed: null }

export type SlotKey =
  | 'al_wc_top' | 'al_wc_bot' | 'al_ds_top' | 'al_ds_bot' | 'al_cs'
  | 'nl_wc_top' | 'nl_wc_bot' | 'nl_ds_top' | 'nl_ds_bot' | 'nl_cs'
  | 'ws'

export type PostseasonBracketCardProps = {
  year: number
  slots: Record<SlotKey, BracketMatchup>
}

// ─── Layout geometry (all in the 1600x900 canvas' own pixel space) ─────────
const W = 1600, H = 900
const COL = { wc: 60, ds: 400, cs: 740, ws: 1160 }
const WIDTH = { wc: 230, ds: 230, cs: 230, ws: 300 }
const BOX_H = 62
const Y = {
  al_wc_top: 190, al_wc_bot: 390, al_ds_top: 190, al_ds_bot: 390, al_cs: 290,
  nl_wc_top: 570, nl_wc_bot: 770, nl_ds_top: 570, nl_ds_bot: 770, nl_cs: 670,
  ws: 480,
}
const pbCss = `
.pb{position:relative;width:${W}px;height:${H}px;background:${C.cream};font-family:${SANS};color:${C.ink};box-sizing:border-box;overflow:hidden}
.pb *{box-sizing:border-box}
.pb-head{position:absolute;top:0;left:0;right:0;padding:32px 48px 0;display:flex;align-items:flex-end;justify-content:space-between}
.pb-brand{display:flex;align-items:baseline;gap:10px}
.pb-brand .pb-mk{color:${C.orange};font-size:26px;font-weight:800;line-height:1}
.pb-brand .pb-nm{font-size:26px;font-weight:800;letter-spacing:-.02em}
.pb-brand .pb-kick{font-family:${MONO};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.faint}}
.pb-title{font-size:22px;font-weight:800;letter-spacing:-.01em}
.pb-colhead{position:absolute;font-family:${MONO};font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${C.orange};text-align:center}
.pb-lgline{position:absolute;left:48px;right:48px;top:480px;height:1px;background:${C.line}}
.pb-lglab{position:absolute;left:48px;font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.faint}}
.pb-slot{position:absolute;background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:7px 12px;display:flex;flex-direction:column;justify-content:center;gap:3px}
.pb-slot.pb-ws{border-width:2px;border-color:${C.orange}}
.pb-row{display:flex;align-items:center;gap:8px}
.pb-seed{width:18px;height:18px;border-radius:50%;background:${C.soft};display:flex;align-items:center;justify-content:center;font-family:${MONO};font-size:9.5px;font-weight:700;color:${C.mute};flex-shrink:0}
.pb-logo{width:24px;height:24px;object-fit:contain;flex-shrink:0}
.pb-row .pb-abbr{font-size:15px;font-weight:800;letter-spacing:-.01em}
.pb-slotlabel{position:absolute;font-family:${MONO};font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:${C.faint};white-space:nowrap}
.pb-status{position:absolute;font-family:${MONO};font-size:8.5px;color:${C.mute};white-space:nowrap}
.pb-empty{font-family:${MONO};font-size:10px;color:${C.faint}}
.pb-foot{position:absolute;bottom:0;left:0;right:0;padding:0 48px 26px;display:flex;align-items:center;justify-content:space-between}
.pb-foot .pb-note{font-family:${MONO};font-size:10px;color:${C.faint}}
.pb-foot .pb-cta{font-size:15px;font-weight:800;color:${C.orange}}
`

function Slot({ m, x, y, width, height = BOX_H, isWs = false }: { m: BracketMatchup; x: number; y: number; width: number; height?: number; isWs?: boolean }) {
  // Either side can be picked independently — a Division Series slot often
  // starts with only the bye seed known, the other side TBD until the Wild
  // Card round finishes. Only fall back to a single "TBD" placeholder when
  // NEITHER side has been picked yet.
  const anyPicked = m.teamA.teamId != null || m.teamB.teamId != null
  return (
    <>
      <div className="pb-slotlabel" style={{ left: x, top: y - height / 2 - 16 }}>{m.label}</div>
      <div className={`pb-slot${isWs ? ' pb-ws' : ''}`} style={{ left: x, top: y - height / 2, width, height }}>
        {anyPicked ? (
          <>
            <TeamRow team={m.teamA} />
            <TeamRow team={m.teamB} />
          </>
        ) : (
          <div className="pb-empty">TBD</div>
        )}
      </div>
      {m.status.trim() && <div className="pb-status" style={{ left: x, top: y + height / 2 + 4 }}>{m.status}</div>}
    </>
  )
}

function TeamRow({ team }: { team: BracketTeam }) {
  const hasTeam = team.teamId != null && team.abbrev
  return (
    <div className="pb-row">
      <span className="pb-seed">{team.seed ?? '—'}</span>
      {hasTeam && <img className="pb-logo" src={teamLogoUrl(team.teamId!)} alt="" />}
      <span className="pb-abbr" style={{ color: hasTeam ? (team.color ?? C.ink) : C.faint }}>{hasTeam ? team.abbrev : '—'}</span>
    </div>
  )
}

// Classic bracket "elbow": two slots on the left merge into one on the right.
function Elbow({ x1, y1, y2, x2 }: { x1: number; y1: number; y2: number; x2: number }) {
  const xm = (x1 + x2) / 2
  const yMid = (y1 + y2) / 2
  return (
    <g stroke={C.line} strokeWidth={1.5} fill="none">
      <line x1={x1} y1={y1} x2={xm} y2={y1} />
      <line x1={x1} y1={y2} x2={xm} y2={y2} />
      <line x1={xm} y1={y1} x2={xm} y2={y2} />
      <line x1={xm} y1={yMid} x2={x2} y2={yMid} />
    </g>
  )
}

function StraightLine({ x1, y, x2 }: { x1: number; y: number; x2: number }) {
  return <line x1={x1} y1={y} x2={x2} y2={y} stroke={C.line} strokeWidth={1.5} />
}

const PostseasonBracketCard = forwardRef<HTMLDivElement, PostseasonBracketCardProps>(function PostseasonBracketCard(props, ref) {
  const { year, slots } = props

  return (
    <div ref={ref} className="pb">
      <style>{pbCss}</style>

      <div className="pb-head">
        <div className="pb-brand">
          <span className="pb-mk">⊕</span>
          <span className="pb-nm">THE EDGE</span>
          <span className="pb-kick">Postseason · {year}</span>
        </div>
        <div className="pb-title">The Bracket</div>
      </div>

      {(['Wild Card', 'Division Series', 'Championship', 'World Series'] as const).map((label, i) => (
        <div key={label} className="pb-colhead" style={{ left: [COL.wc, COL.ds, COL.cs, COL.ws][i], width: [WIDTH.wc, WIDTH.ds, WIDTH.cs, WIDTH.ws][i], top: 76 }}>{label}</div>
      ))}

      <div className="pb-lglab" style={{ top: 465 }}>AL</div>
      <div className="pb-lglab" style={{ top: 486 }}>NL</div>
      <div className="pb-lgline" />

      <svg viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <StraightLine x1={COL.wc + WIDTH.wc} y={Y.al_wc_top} x2={COL.ds} />
        <StraightLine x1={COL.wc + WIDTH.wc} y={Y.al_wc_bot} x2={COL.ds} />
        <StraightLine x1={COL.wc + WIDTH.wc} y={Y.nl_wc_top} x2={COL.ds} />
        <StraightLine x1={COL.wc + WIDTH.wc} y={Y.nl_wc_bot} x2={COL.ds} />
        <Elbow x1={COL.ds + WIDTH.ds} y1={Y.al_ds_top} y2={Y.al_ds_bot} x2={COL.cs} />
        <Elbow x1={COL.ds + WIDTH.ds} y1={Y.nl_ds_top} y2={Y.nl_ds_bot} x2={COL.cs} />
        <Elbow x1={COL.cs + WIDTH.cs} y1={Y.al_cs} y2={Y.nl_cs} x2={COL.ws} />
      </svg>

      <Slot m={slots.al_wc_top} x={COL.wc} y={Y.al_wc_top} width={WIDTH.wc} />
      <Slot m={slots.al_wc_bot} x={COL.wc} y={Y.al_wc_bot} width={WIDTH.wc} />
      <Slot m={slots.al_ds_top} x={COL.ds} y={Y.al_ds_top} width={WIDTH.ds} />
      <Slot m={slots.al_ds_bot} x={COL.ds} y={Y.al_ds_bot} width={WIDTH.ds} />
      <Slot m={slots.al_cs} x={COL.cs} y={Y.al_cs} width={WIDTH.cs} />

      <Slot m={slots.nl_wc_top} x={COL.wc} y={Y.nl_wc_top} width={WIDTH.wc} />
      <Slot m={slots.nl_wc_bot} x={COL.wc} y={Y.nl_wc_bot} width={WIDTH.wc} />
      <Slot m={slots.nl_ds_top} x={COL.ds} y={Y.nl_ds_top} width={WIDTH.ds} />
      <Slot m={slots.nl_ds_bot} x={COL.ds} y={Y.nl_ds_bot} width={WIDTH.ds} />
      <Slot m={slots.nl_cs} x={COL.cs} y={Y.nl_cs} width={WIDTH.cs} />

      <Slot m={slots.ws} x={COL.ws} y={Y.ws} width={WIDTH.ws} height={72} isWs />

      <div className="pb-foot">
        <div className="pb-note">Matchups and results as reported · The Edge</div>
        <div className="pb-cta">edgereportdaily.com</div>
      </div>
    </div>
  )
})

export default PostseasonBracketCard
