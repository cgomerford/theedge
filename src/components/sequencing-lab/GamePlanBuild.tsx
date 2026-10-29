'use client'

// src/components/sequencing-lab/GamePlanBuild.tsx
//
// Game Plan Card → Build your own card. Start from tonight's card and make it yours: reorder the lineup, take a hitter out, swap in a hitter from this club's recent lineups (when the card
// carries them), choose which columns show, write a note on a hitter, and see the pairs you saved from Second Look. The wristband below follows every change and downloads as a PNG.
// Your edits live in THIS browser only (localStorage), per card; nothing is sent to the server. The figures are the stored card's, unchanged: swapping a hitter does not recompute anything.

import { useEffect, useMemo, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import type { Card, CardHitter } from '@/lib/game-plan/data'
import { readStore, removePair, saveEdits, type SavedPair } from '@/lib/game-plan/saved'
import PitchDot from './PitchDot'
import { ALL_COLS, LineupTable, Wristband, type Cols } from './GamePlanCells'
import { kick, note, tile } from './ui'

const COL_LABEL: [keyof Cols, string][] = [['first', 'First pitch'], ['opener', 'Opener'], ['two', 'Two strikes'], ['damage', 'Damage zones'], ['second', 'Second look']]
const small: React.CSSProperties = { fontFamily: SANS, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap', border: `1px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer' }

export default function GamePlanBuild({ card }: { card: Card }) {
  const key = `${card.meta.gamePk}-${card.starter.id}`
  const pool = useMemo(() => [...card.hitters, ...(card.bench ?? [])], [card])
  const [order, setOrder] = useState<number[]>(card.hitters.map(h => h.id))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [cols, setCols] = useState<Cols>(ALL_COLS)
  const [pairs, setPairs] = useState<SavedPair[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const s = readStore()
    const e = s.cards[key]
    if (e?.order?.length) setOrder(e.order.filter(id => pool.some(h => h.id === id)).slice(0, 9))
    if (e?.notes) setNotes(e.notes)
    if (e?.cols) setCols({ ...ALL_COLS, ...(e.cols as Partial<Cols>) })
    setPairs(s.pairs)
    setReady(true)
  }, [key, pool])
  useEffect(() => { if (ready) saveEdits(key, { order, notes, cols }) }, [ready, key, order, notes, cols])

  const lineup = order.map(id => pool.find(h => h.id === id)).filter((h): h is CardHitter => !!h)
  const out = pool.filter(h => !order.includes(h.id))
  const move = (i: number, d: number) => setOrder(o => { const j = i + d; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n })
  const reset = () => { setOrder(card.hitters.map(h => h.id)); setNotes({}); setCols(ALL_COLS) }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={tile}>
        <div style={kick}>Make it yours</div>
        <p style={note}>Begin with {card.starter.name}&apos;s card. Move hitters up or down, take one out, swap one in from {card.batting.name}&apos;s recent lineups{card.bench?.length ? '' : ' (this card was built before swaps existed, so only its own nine are here)'}, and choose the columns. It saves in this browser.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginRight: 4 }}>Show</span>
          {COL_LABEL.map(([k, l]) => <button key={k} type="button" aria-pressed={cols[k]} onClick={() => setCols(c => ({ ...c, [k]: !c[k] }))} style={{ ...small, padding: '6px 12px', border: `1px solid ${cols[k] ? C.orange : C.line}`, background: cols[k] ? '#fff1ea' : '#fff', color: cols[k] ? C.orange : C.ink }}>{l}</button>)}
          <button type="button" onClick={reset} style={{ ...small, marginLeft: 'auto' }}>Reset to the card</button>
        </div>
      </div>

      <LineupTable hitters={lineup} hand={card.starter.hand} cols={cols} notes={notes} lead={(h, i) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${h.name} up`} style={{ ...small, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === lineup.length - 1} aria-label={`Move ${h.name} down`} style={{ ...small, opacity: i === lineup.length - 1 ? 0.4 : 1 }}>↓</button>
          <button type="button" onClick={() => setOrder(o => o.filter(x => x !== h.id))} aria-label={`Take ${h.name} out`} style={{ ...small, color: '#D4533B' }}>Out</button>
        </span>
      )} />

      {out.length > 0 && lineup.length < 9 && (
        <div style={tile}>
          <div style={kick}>Swap a hitter in</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {out.map(h => <button key={h.id} type="button" onClick={() => setOrder(o => (o.length < 9 ? [...o, h.id] : o))} style={{ ...small, padding: '6px 12px' }}>+ {h.name}{h.bats ? ` (${h.bats})` : ''}</button>)}
          </div>
        </div>
      )}

      <div style={tile}>
        <div style={kick}>Notes on hitters</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 8, marginTop: 8 }}>
          {lineup.map((h, i) => (
            <label key={h.id} style={{ display: 'grid', gap: 3, fontSize: 12, fontWeight: 800, color: C.mute }}>{i + 1} · {h.name}
              <input value={notes[String(h.id)] ?? ''} maxLength={60} onChange={e => setNotes(n => ({ ...n, [String(h.id)]: e.target.value }))} placeholder="Write a note for the wristband" style={{ font: 'inherit', fontSize: 13, fontWeight: 600, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px' }} />
            </label>
          ))}
        </div>
      </div>

      <div style={tile}>
        <div style={kick}>Saved from Second Look</div>
        {pairs.length === 0 ? <p style={note}>Nothing saved yet. On Second Look, press &quot;Add to a Game Plan Card&quot; beside a pair and it appears here.</p> : (
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {pairs.map(p => (
              <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', alignItems: 'center', background: '#faf8f3', borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
                <b>{p.pitcher} to {p.batter}</b><span style={{ color: C.mute }}>{p.date}</span>
                <span style={{ display: 'inline-flex', gap: 3 }}>{p.first.map((x, i) => <PitchDot key={i} t={x.t} size={18} ring={x.r === 'whiff'} />)}</span><span aria-hidden>→</span>
                <span style={{ display: 'inline-flex', gap: 3 }}>{p.second.map((x, i) => <PitchDot key={i} t={x.t} size={18} ring={x.r === 'whiff'} />)}</span>
                <b>{p.result}</b>
                <button type="button" onClick={() => { removePair(p.id); setPairs(readStore().pairs) }} style={{ ...small, marginLeft: 'auto' }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ ...kick, marginBottom: 6 }}>⊕ Your wristband</div>
        <Wristband card={card} hitters={lineup} notes={notes} />
      </div>
    </div>
  )
}
