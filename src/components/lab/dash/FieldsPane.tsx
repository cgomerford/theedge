'use client'

// src/components/lab/dash/FieldsPane.tsx
//
// Right-hand "Visuals / Fields" pane, like Power BI's: add a visual, then edit
// whichever one is selected on the canvas.

import { C, SANS } from '@/components/team/ui'
import { METRICS, ROLE_LABEL } from '@/lib/lab/team-summary'
import type { Role } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'
import { ch, type Channel, type Kind, type Tile } from '@/components/lab/dash/types'

const GROUPS = ['Outcomes', 'Results', 'Variation', 'Velocity', 'Movement', 'Mix', 'Staff']
const ROLES: Role[] = ['all', 'sp', 'rp']
const sel: React.CSSProperties = { fontFamily: SANS, fontSize: 13, fontWeight: 600, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, minWidth: 0 }
const lab: React.CSSProperties = { fontFamily: SANS, fontSize: 10, letterSpacing: '.1em', color: C.mute, textTransform: 'uppercase' }

function Picker({ label, optional, value, onChange, onRemove }: { label: string; optional?: boolean; value: Channel | null; onChange: (c: Channel | null) => void; onRemove?: () => void }) {
  return (
    <div>
      <div style={{ ...lab, marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>{onRemove && <button onClick={onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', color: C.faint, fontSize: 11 }}>remove</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 104px', gap: 6 }}>
        <select value={value?.metric ?? ''} onChange={e => onChange(e.target.value ? { metric: e.target.value, role: value?.role ?? 'all' } : null)} style={sel}>
          {optional && <option value="">None</option>}
          {GROUPS.map(g => (
            <optgroup key={g} label={g}>{METRICS.filter(m => m.group === g).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
          ))}
        </select>
        <select value={value?.role ?? 'all'} disabled={!value} onChange={e => value && onChange({ ...value, role: e.target.value as Role })} style={sel}>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
    </div>
  )
}

const KINDS: { kind: Kind; label: string; icon: string }[] = [
  { kind: 'kpi', label: 'KPI card', icon: '#' }, { kind: 'scatter', label: 'Scatter', icon: '⁘' },
  { kind: 'bars', label: 'Bars', icon: '▤' }, { kind: 'table', label: 'Table', icon: '▦' },
  { kind: 'hist', label: 'Histogram', icon: '▂▅▇' }, { kind: 'radar', label: 'Radar', icon: 'R' },
  { kind: 'mix', label: 'Pitch-mix donut', icon: '◔' }, { kind: 'dumbbell', label: 'Starters vs bullpen', icon: '●-●' },
  { kind: 'movement', label: 'Movement map', icon: '⊹' }, { kind: 'flight', label: 'Pitch flight (animated)', icon: '▶' }, { kind: 'armclock', label: 'Arm-angle clock', icon: '◜' }, { kind: 'heat', label: 'Pitch-type heatmap', icon: '▩' },
]

export default function FieldsPane({ tile, onAdd, onChange }: { tile: Tile | null; onAdd: (k: Kind) => void; onChange: (patch: Partial<Tile>) => void }) {
  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontFamily: SANS, fontSize: 13, color: '#5b5347', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} /> {label}
    </label>
  )
  return (
    <aside className="dash-pane" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ ...lab, color: C.orange, fontWeight: 700 }}>New visual</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, margin: '8px 0 16px' }}>
        {KINDS.map(k => (
          <button key={k.kind} onClick={() => onAdd(k.kind)} style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, padding: '8px 6px', borderRadius: 8, border: `1px solid ${C.line}`, background: C.soft, cursor: 'pointer', color: C.ink }}>
            <span style={{ fontFamily: SANS, marginRight: 6, color: C.orange }}>{k.icon}</span>{k.label}
          </button>
        ))}
      </div>

      {!tile ? (
        <p style={{ fontFamily: SANS, fontSize: 13, color: C.faint, margin: 0 }}>Click a visual on the canvas to edit it.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...lab, color: C.orange, fontWeight: 700 }}>Edit · {KINDS.find(k => k.kind === tile.kind)?.label}</div>
          <input value={tile.title} onChange={e => onChange({ title: e.target.value })} placeholder="Title (blank = automatic)" style={{ ...sel, fontWeight: 400 }} />
          <div>
            <div style={{ ...lab, marginBottom: 3 }}>Width</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([1, 2, 4] as const).map(w => (
                <button key={w} onClick={() => onChange({ span: w })} style={{ flex: 1, fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${tile.span === w ? C.ink : C.line}`, background: tile.span === w ? C.ink : '#fff', color: tile.span === w ? '#fff' : '#5b5347' }}>
                  {w === 1 ? 'Small' : w === 2 ? 'Medium' : 'Full'}
                </button>
              ))}
            </div>
          </div>
          {tile.kind === 'scatter' && <>
            <Picker label="X axis" value={tile.x} onChange={c => c && onChange({ x: c })} />
            <Picker label="Y axis" value={tile.y} onChange={c => c && onChange({ y: c })} />
            <Picker label="Size" optional value={tile.size} onChange={c => onChange({ size: c })} />
            <Picker label="Colour" optional value={tile.color} onChange={c => onChange({ color: c })} />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {toggle(tile.trend, v => onChange({ trend: v }), 'Trend line')}{toggle(tile.labels, v => onChange({ labels: v }), 'Labels')}
            </div>
          </>}
          {tile.kind === 'bars' && <>
            <Picker label="Metric" value={tile.x} onChange={c => c && onChange({ x: c })} />
            {toggle(tile.desc, v => onChange({ desc: v }), 'Highest first')}
          </>}
          {(tile.kind === 'kpi' || tile.kind === 'hist' || tile.kind === 'dumbbell') && <Picker label="Metric" value={tile.x} onChange={c => c && onChange({ x: c })} />}
          {(tile.kind === 'mix' || tile.kind === 'movement' || tile.kind === 'heat' || tile.kind === 'flight' || tile.kind === 'armclock') && (
            <div>
              <div style={{ ...lab, marginBottom: 3 }}>Pitchers</div>
              <select value={tile.x.role} onChange={e => onChange({ x: { ...tile.x, role: e.target.value as Role } })} style={{ ...sel, width: '100%' }}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          )}
          {tile.kind === 'mix' && toggle(tile.split !== false, v => onChange({ split: v }), 'One donut per selected team (needs 2+ teams)')}
          {tile.kind === 'heat' && (
            <div>
              <div style={{ ...lab, marginBottom: 3 }}>Cells show</div>
              <select value={tile.heat ?? 'use'} onChange={e => onChange({ heat: e.target.value as 'use' | 'whiff' | 'velo' })} style={{ ...sel, width: '100%' }}>
                <option value="use">Usage %</option><option value="whiff">Whiff %</option><option value="velo">Velocity</option>
              </select>
            </div>
          )}
          {tile.kind === 'dumbbell' && <p style={{ fontFamily: SANS, fontSize: 9.5, color: C.faint, margin: 0 }}>Always compares starters with bullpen, so the Pitchers filter doesn&apos;t apply.</p>}
          {(tile.kind === 'table' || tile.kind === 'radar') && <>
            {tile.cols.map((c, i) => (
              <Picker key={i} label={`Column ${i + 1}`} value={c} onChange={v => v && onChange({ cols: tile.cols.map((o, j) => (j === i ? v : o)) })} onRemove={tile.cols.length > 1 ? () => onChange({ cols: tile.cols.filter((_, j) => j !== i) }) : undefined} />
            ))}
            {tile.cols.length < (tile.kind === 'radar' ? 8 : 10) && <button onClick={() => onChange({ cols: [...tile.cols, ch('whiff')] })} style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '6px', borderRadius: 8, border: `1px dashed ${C.line}`, background: 'transparent', cursor: 'pointer', color: '#5b5347' }}>+ New column</button>}
          </>}
        </div>
      )}
    </aside>
  )
}
