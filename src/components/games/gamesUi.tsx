// src/components/games/gamesUi.tsx
//
// Small shared pieces for the Games pages on The Stats: team colours, the runners diamond, call colours.
// Client-safe (no server imports).

import { MLB_TEAMS } from '@/lib/teams'
import { deepGroupLabel } from '@/lib/stats-query-catalog'
import type { PitchCall } from '@/lib/game-explorer'

export const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
export const baseText = (mask: number) => deepGroupLabel('base_state', String(mask))

/** Club colours by MLB team id; neutral ink if a club is somehow missing (never a guess). */
export function teamColors(teamId: number): { primary: string; text: string } {
  const t = MLB_TEAMS.find(x => x.id === teamId)
  return t ? { primary: t.primary_color, text: t.text_on_primary } : { primary: '#1A1A1A', text: '#FFFFFF' }
}

/** Colour encodes what happened to the pitch. Each also has a text label, so colour is never the only cue. */
export const CALL_COLOR: Record<PitchCall, string> = {
  ball: '#b9b2a3', called_strike: '#FF5722', swinging_strike: '#1A1A1A', foul: '#c79a2b', in_play: '#1D9E75', other: '#8a8275',
}
export const CALL_LABEL: Record<PitchCall, string> = {
  ball: 'Ball', called_strike: 'Called strike', swinging_strike: 'Swinging strike', foul: 'Foul', in_play: 'In play', other: 'Other',
}

/** Runners diamond: bit 1 = first, 2 = second, 4 = third. */
export function Diamond({ mask, size = 56, ink = '#1A1A1A', off = '#fff' }: { mask: number; size?: number; ink?: string; off?: string }) {
  const base = (x: number, y: number, on: boolean) => (
    <rect x={x - 7} y={y - 7} width={14} height={14} transform={`rotate(45 ${x} ${y})`} fill={on ? '#FF5722' : off} stroke={ink} strokeWidth={1.8} />
  )
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`Runners: ${baseText(mask)}`}>
      {base(50, 32, !!(mask & 1))}{base(32, 14, !!(mask & 2))}{base(14, 32, !!(mask & 4))}
      <rect x={28} y={46} width={8} height={8} fill={off} stroke={ink} strokeWidth={1.5} transform="rotate(45 32 50)" />
    </svg>
  )
}

export function Outs({ n, ink = '#1A1A1A' }: { n: number; ink?: string }) {
  return (
    <span aria-label={`${n} out`} style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle', marginLeft: 4 }}>
      {[0, 1, 2].map(i => <i key={i} style={{ width: 8, height: 8, borderRadius: 4, border: `1.5px solid ${ink}`, background: i < n ? ink : 'transparent', display: 'inline-block' }} />)}
    </span>
  )
}

export const GAMES_CSS = `
.gm-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.gm-card{display:flex;flex-direction:column;background:#fff;border:1px solid #e7e2d8;border-radius:14px;padding:14px;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
.gm-card:hover,.gm-card:focus-visible{border-color:#1A1A1A;transform:translateY(-2px)}
.gm-grid{display:grid;grid-template-columns:320px minmax(0,1fr) 420px;gap:16px;margin-top:16px;align-items:start}
@media (max-width:1250px){.gm-grid{grid-template-columns:300px minmax(0,1fr)}.gm-grid .gm-rt{grid-column:1/-1}}
@media (max-width:860px){.gm-grid{grid-template-columns:minmax(0,1fr)}}
.gm-sum{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
@media (max-width:900px){.gm-sum{grid-template-columns:minmax(0,1fr)}}
.gm-pz{display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:760px){.gm-pz{grid-template-columns:minmax(0,1fr)}}
.gm-btn:hover{border-color:#1A1A1A!important}
@keyframes gm-pulse{0%{box-shadow:0 0 0 0 rgba(255,87,34,.55)}100%{box-shadow:0 0 0 8px rgba(255,87,34,0)}}
.gm-fly{animation:gm-fly .75s cubic-bezier(.2,.7,.3,1) both}
@keyframes gm-fly{0%{transform:translate(var(--dx),var(--dy)) scale(.25);opacity:0}15%{opacity:1}100%{transform:translate(0,0) scale(1);opacity:1}}
@keyframes gm-draw{from{stroke-dashoffset:var(--len)}to{stroke-dashoffset:0}}
@keyframes gm-fade{from{opacity:.6}to{opacity:0}}
.gm-trail{opacity:.6;animation:gm-draw .75s cubic-bezier(.2,.7,.3,1) both,gm-fade .9s ease-out .75s forwards}
@media (prefers-reduced-motion:reduce){.gm-fly{animation:none}.gm-trail{display:none}}
.gm-live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF5722;margin-right:6px;animation:gm-pulse 1.6s infinite}
`

/** Plain-English place name for where a pitch crossed the plate, from the batter's side. */
export function zoneWords(x: number | null, z: number | null, stand: string, szTop: number | null, szBottom: number | null): string {
  if (x == null || z == null) return 'location unavailable'
  const top = szTop ?? 3.5, bot = szBottom ?? 1.5, third = (top - bot) / 3
  const v = z > top - third ? 'high' : z < bot + third ? 'low' : 'middle'
  const inside = stand === 'R' ? x < -0.28 : x > 0.28
  const away = stand === 'R' ? x > 0.28 : x < -0.28
  const h = inside ? 'inside' : away ? 'away' : 'middle'
  return v === 'middle' && h === 'middle' ? 'middle-middle' : `${v} and ${h}`
}
