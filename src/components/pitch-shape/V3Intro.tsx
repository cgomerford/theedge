'use client'

// src/components/pitch-shape/V3Intro.tsx
//
// Pitch Shape v3, step 1: the guided start. A headline, the "what do you want this pitch to do?" chooser, and the three-card "how to read this" strip (collapsed after the first visit).
// Miss bats colours the map by whiffs per swing today. Ground balls and weak contact need ground-ball and hard-hit counts in the league shape grid (scripts/build_pitch_shape_results.py
// does not store them yet), so those two cards say so instead of colouring the map from a stand-in. Plain data in, no fetching.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'

export type Goal = 'whiff' | 'gb' | 'hard'

const GOALS: { id: Goal; title: string; line: string; ready: boolean }[] = [
  { id: 'whiff', title: 'Miss bats', line: 'Whiffs per swing. Higher is better for the pitcher.', ready: true },
  { id: 'gb', title: 'Get ground balls', line: 'Ground balls per ball in play. Higher is better for the pitcher.', ready: false },
  { id: 'hard', title: 'Get weak contact', line: 'Hard-hit balls per ball in play. Lower is better for the pitcher.', ready: false },
]

const STORE = 'x9-shape-v3-read-seen'

export default function V3Intro({ goal, onGoal, lc, offUrl }: { goal: Goal; onGoal: (g: Goal) => void; lc: string; offUrl: string }) {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try { if (localStorage.getItem(STORE) === '1') setOpen(false); else localStorage.setItem(STORE, '1') } catch { /* private window: stay open */ }
  }, [])
  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '12px 14px' }
  const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, textTransform: 'uppercase', color: '#c2410c', marginBottom: 4 }
  return (
    <section aria-label="Start here" style={{ margin: '0 0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, fontSize: 'clamp(20px, 2.6vw, 28px)', letterSpacing: '-0.01em', lineHeight: 1.15, color: C.ink }}>Find pitchers whose pitch should be working better than it is.</div>
        <a href={offUrl} style={{ fontSize: 12.5, fontWeight: 700, color: '#5b5347' }}>Back to the current view</a>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, margin: '10px 0 6px', color: C.ink }}>What do you want this {lc} to do?</div>
      <div className="v3-goals" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <style>{'@media(max-width:800px){.v3-goals,.v3-read{grid-template-columns:1fr !important}}'}</style>
        {GOALS.map(g => {
          const on = g.id === goal
          return (
            <button key={g.id} type="button" disabled={!g.ready} aria-pressed={on} onClick={() => onGoal(g.id)}
              style={{ ...card, textAlign: 'left', cursor: g.ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minHeight: 64, opacity: g.ready ? 1 : 0.6, borderColor: on ? '#FF5722' : C.line, boxShadow: on ? '0 0 0 2px #FF5722 inset' : undefined }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: C.ink }}>{g.title}</div>
              <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 2, lineHeight: 1.4 }}>{g.line}</div>
              {!g.ready && <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8a8275', marginTop: 4 }}>Not available yet: the shape data does not count these.</div>}
            </button>
          )
        })}
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ marginTop: 10, minHeight: 40, padding: '0 12px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
        {open ? 'Hide how to read this' : 'How to read this'}
      </button>
      {open && (
        <div className="v3-read" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 8 }}>
          <div style={card}><div style={k}>What a square means</div><div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#3a352c' }}>Each square is a way a {lc} can move: further right means more tail toward the arm side, higher means more rise. It is not the strike zone.</div></div>
          <div style={card}><div style={k}>What it can tell you</div><div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#3a352c' }}>What pitches shaped like this have done. When a pitcher’s results trail the pitches shaped like his, something besides the shape is costing him.</div></div>
          <div style={card}><div style={k}>What it can’t tell you</div><div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#3a352c' }}>Where he throws it, how he sequences it, or what hitters expect. Squares with few swings are left blank. Every rate shows its sample.</div></div>
        </div>
      )}
    </section>
  )
}
