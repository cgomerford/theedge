'use client'

// src/components/sequencing-lab/PitcherPick.tsx
//
// "Start from a pitcher's pitch": find a pitcher, see his pitches with their average speed and break, and press one to put the finder's sliders where that pitch sits.
// Optional: the finder works without it. Numbers are the stored pitch_shape_pitcher averages for this season, through /api/sequencing/pitcher-pitches.

import { useEffect, useMemo, useState } from 'react'
import SpinBall from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import { kick, note } from '@/components/pitching-lab/LocationExplorer'

export type PitcherChoice = { t: string; hand: 'R' | 'L' | null; speed: number; hb: number; ivb: number; name: string }
type Pitch = { t: string; n: number; velo: number; hb: number; ivb: number }

export default function PitcherPick({ pitchers, onUse }: { pitchers: { id: number; name: string; hand: 'L' | 'R' | null }[]; onUse: (c: PitcherChoice) => void }) {
  const [q, setQ] = useState('')
  const [who, setWho] = useState<{ id: number; name: string; hand: 'L' | 'R' | null } | null>(null)
  const [data, setData] = useState<{ hand: 'R' | 'L' | null; pitches: Pitch[] } | 'loading' | 'error' | null>(null)
  const matches = useMemo(() => { const s = q.trim().toLowerCase(); return s.length < 2 ? [] : pitchers.filter(p => p.name.toLowerCase().includes(s)).slice(0, 6) }, [q, pitchers])

  useEffect(() => {
    if (!who) return
    const ac = new AbortController()
    setData('loading')
    fetch(`/api/sequencing/pitcher-pitches?id=${who.id}`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(j => setData(j))
      .catch(e => { if (e?.name !== 'AbortError') setData('error') })
    return () => ac.abort()
  }, [who])

  return (
    <div style={{ marginBottom: 12, fontFamily: SANS }}>
      <div style={kick}>Begin from a pitcher&apos;s pitch · optional</div>
      <div style={{ position: 'relative', marginTop: 6, maxWidth: 320 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a pitcher, e.g. Skubal" aria-label="Find a pitcher" style={{ width: '100%', font: 'inherit', fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px' }} />
        {matches.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
            {matches.map(m => <button key={m.id} type="button" onClick={() => { setWho(m); setQ('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 0, background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700 }}>{m.name}{m.hand ? <span style={{ color: C.faint, fontWeight: 600 }}> · {m.hand === 'L' ? 'left' : 'right'}-handed</span> : null}</button>)}
          </div>
        )}
      </div>
      {who && (
        <div style={{ marginTop: 8 }}>
          {data === 'loading' || data === null ? <p style={note}>Finding {who.name}&apos;s pitches…</p>
            : data === 'error' ? <p style={note}>Could not load {who.name}&apos;s pitches.</p>
            : data.pitches.length === 0 ? <p style={note}>No measured pitches stored for {who.name} this season.</p>
            : (
              <>
                <p style={{ ...note, marginTop: 0 }}>{who.name}: press a pitch to set the sliders to it.</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {data.pitches.map(p => (
                    <button key={p.t} type="button" onClick={() => onUse({ t: p.t, hand: data.hand ?? who.hand, speed: p.velo, hb: p.hb, ivb: p.ivb, name: who.name })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 999, padding: '4px 11px 4px 5px', font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', color: C.ink }}>
                      <SpinBall code={p.t} size={20} />{pitchLabel(p.t)} <span style={{ fontWeight: 600, color: C.mute }}>{p.velo.toFixed(1)} mph · {p.hb > 0 ? '+' : ''}{p.hb.toFixed(0)} / {p.ivb > 0 ? '+' : ''}{p.ivb.toFixed(0)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
        </div>
      )}
    </div>
  )
}
