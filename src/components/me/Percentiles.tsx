// src/components/me/Percentiles.tsx
//
// A player card's Statcast percentiles. The free 3 are real bars. For a viewer who is not Pro the rest are SERVER-RENDERED PLACEHOLDERS: fixed dummy bar widths, the generic label
// "Pro metric", no numbers (the loader never sent the real ranks, see src/lib/follows/percentiles.ts). Pro gets the full set, built inside the front-office ProGate render function so
// it is never constructed for anyone else. Never blur real data. A block under the sample minimum shows "Small sample (n = X)".
import Link from 'next/link'
import ProGate from '@/components/front-office/ProGate'
import SmallSample from '@/components/data/SmallSample'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { PctBlock, PctRow } from '@/lib/follows/percentiles'
import { C, EYEBROW, GREY, NUMS, SANS } from './ui'

const DUMMY = [80, 65, 72, 50, 62, 44, 70, 56, 48, 66, 40, 58]

function Row({ r }: { r: PctRow }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 28px', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '2px 0' }}>
      <span style={{ fontFamily: SANS }}>{r.label}</span>
      <span role="img" aria-label={`${r.label}: ${r.pct}th percentile`} style={{ height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: C.ink, borderRadius: 4 }} /></span>
      <b style={{ textAlign: 'right', ...NUMS }}>{r.pct}</b>
    </div>
  )
}

function LockedRows({ count }: { count: number }) {
  const n = Math.min(count, 5)
  if (n === 0) return null
  return (
    <div style={{ position: 'relative', marginTop: 2 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} aria-hidden style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 28px', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '2px 0', opacity: 0.55 }}>
          <span style={{ color: GREY }}>Pro metric</span>
          <span style={{ height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${DUMMY[i % DUMMY.length]}%`, background: '#cfc9ba', borderRadius: 4 }} /></span>
          <span />
        </div>
      ))}
      <Link href="/pricing" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 800, color: C.orange, border: `1px solid ${C.orange}`, borderRadius: 999, padding: '2px 9px', background: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>PRO · full set · See Pro</Link>
    </div>
  )
}

export default function Percentiles({ block, isPro, unit }: { block: PctBlock | undefined; isPro: boolean; unit: string }) {
  return (
    <div>
      <div style={{ ...EYEBROW, margin: '14px 0 6px' }}>Statcast percentiles</div>
      {!block || block.state === 'pending' ? <p style={{ margin: 0, fontSize: 13, color: GREY }}>Percentiles pending.</p>
        : block.state === 'small' ? <div style={{ fontSize: 13 }}><SmallSample n={block.n} /><div style={{ fontSize: 11.5, color: GREY, marginTop: 2 }}>Needs {block.need} {unit} to show percentiles.</div></div>
        : (
          <>
            {block.rows.slice(0, 3).map(r => <Row key={r.key} r={r} />)}
            <ProGate isPro={isPro} render={() => <>{block.rows.slice(3).map(r => <Row key={r.key} r={r} />)}</>} fallback={<LockedRows count={block.lockedCount} />} />
            {block.hardHitSmall != null && <div style={{ fontSize: 12, color: GREY, marginTop: 4 }}>Hard-hit%: <SmallSample n={block.hardHitSmall} /> (needs {MIN_SAMPLE.hardHitBBE} batted balls)</div>}
          </>
        )}
    </div>
  )
}
