'use client'

// Dev-only: renders the real Shape tab and Shape Sandbox on SYNTHETIC bins so the layout, gating and
// empty states can be judged before the data writer exists. Not linked from anywhere.

import { useMemo, useState } from 'react'
import ShapeLab from '@/components/pitch-shape/ShapeLab'
import ShapeSandbox, { type LoadBins, type SearchPitchers } from '@/components/pitch-shape/ShapeSandbox'
import { FIXTURE_TYPES, fixtureBins, fixtureLab } from '@/lib/pitch-shape/dev-fixture'

const seg = (on: boolean): React.CSSProperties => ({ background: on ? '#FDE047' : 'transparent', color: on ? '#1A1A1A' : '#ddd', border: 0, padding: '5px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' })

export default function PreviewClient({ initialPro, initialPage }: { initialPro: boolean; initialPage: 'lab' | 'sandbox' }) {
  const [page, setPage] = useState<'lab' | 'sandbox'>(initialPage)
  const [isPro, setIsPro] = useState(initialPro)
  const lab = useMemo(() => fixtureLab(), [])
  const loadBins: LoadBins = useMemo(() => async (t, h) => fixtureBins(t, h), [])
  const searchPitchers: SearchPitchers = useMemo(() => async q => lab.pitches.length && 'sample pitcher'.includes(q.toLowerCase().trim())
    ? [{ id: 0, name: lab.name, team: lab.teamAbbr, hand: lab.hand, season: lab.season, pitches: lab.pitches.map(p => ({ pitchType: p.pitchType, n: p.current.n, shape: { velo: p.current.velo, ivb: p.current.ivb, hb: p.current.hb, slot: p.current.slot } })) }]
    : [], [lab])

  return (
    <div style={{ background: '#FAF8F3', minHeight: '100vh' }}>
      <div style={{ background: '#1A1A1A', color: '#fff', padding: '8px 24px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, position: 'sticky', top: 0, zIndex: 50 }}>
        <b style={{ letterSpacing: '.14em', fontSize: 10, color: '#FDE047' }}>DEV PREVIEW</b>
        <span style={{ border: '1px solid #555', borderRadius: 999, overflow: 'hidden', display: 'inline-flex' }}>
          <button type="button" style={seg(page === 'lab')} onClick={() => setPage('lab')}>Pitching Lab · Shape tab</button>
          <button type="button" style={seg(page === 'sandbox')} onClick={() => setPage('sandbox')}>Shape Sandbox</button>
        </span>
        <span style={{ border: '1px solid #555', borderRadius: 999, overflow: 'hidden', display: 'inline-flex' }}>
          <button type="button" style={seg(!isPro)} onClick={() => setIsPro(false)}>Free</button>
          <button type="button" style={seg(isPro)} onClick={() => setIsPro(true)}>Pro</button>
        </span>
        <span style={{ color: '#aaa', marginLeft: 'auto' }}>Synthetic sample data — not real pitches</span>
      </div>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px 100px' }}>
        {page === 'lab'
          ? <ShapeLab data={lab} isPro={isPro} />
          : <ShapeSandbox isPro={isPro} pitchTypes={FIXTURE_TYPES} loadBins={loadBins} searchPitchers={searchPitchers} />}
      </div>
    </div>
  )
}
