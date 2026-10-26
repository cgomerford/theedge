// Spray tab body (server component): every ball he put in play this season on a field outline, with pull / centre / oppo shares.
// Data: batter_spray (scripts/fetch_batter_spray.py). Statcast field coordinates -> feet from home plate; thirds are by direction.
import ThroughDate from '@/components/data/ThroughDate'
import PendingBlock from '@/components/data/PendingBlock'
import { MIN_SAMPLE } from '@/lib/min-sample'
import type { SprayPlay } from '@/lib/batter-spray'

const MUTE = '#8a8275'
const HIT = new Set(['single', 'double', 'triple', 'home_run'])
const ft = (p: SprayPlay) => ({ x: (p.x - 125.42) * 2.5, y: (198.27 - p.y) * 2.5 })
const ang = (p: SprayPlay) => { const { x, y } = ft(p); return (Math.atan2(x, y) * 180) / Math.PI }   // 0 = centre, negative = left field

export default function SprayView({ plays, bats }: { plays: SprayPlay[]; bats: 'L' | 'R' | 'S' | null }) {
  const usable = plays.filter(p => typeof p.x === 'number' && typeof p.y === 'number')
  if (usable.length === 0) return <PendingBlock label="Spray chart (no balls in play stored for this season)" />
  const n = usable.length
  const left = usable.filter(p => ang(p) < -15).length, right = usable.filter(p => ang(p) > 15).length, centre = n - left - right
  const pct = (v: number) => `${Math.round((v / n) * 100)}%`
  const pull = bats === 'R' ? left : bats === 'L' ? right : null
  const oppo = bats === 'R' ? right : bats === 'L' ? left : null
  const small = n < MIN_SAMPLE.sprayBBE
  const through = usable.reduce<string | null>((m, p) => (p.gd && (!m || p.gd > m) ? p.gd : m), null)
  const Star = () => <span style={{ color: '#FF5722', fontWeight: 800 }}>*</span>
  return (
    <div className="sp-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 32, alignItems: 'start' }}>
      <style>{`@media (max-width:900px){.sp-grid{grid-template-columns:minmax(0,1fr)!important}}`}</style>
      <figure style={{ margin: 0 }}>
        <svg viewBox="-340 -440 680 460" width="100%" role="img" aria-label={`Where he hit the ball, ${n} balls in play`} style={{ display: 'block' }}>
          <polygon points="0,0 63.6,-63.6 0,-127.3 -63.6,-63.6" fill="none" stroke="#d9d2c3" strokeWidth="1.5" />
          <line x1="0" y1="0" x2="-233" y2="-233" stroke="#d9d2c3" strokeWidth="1.5" /><line x1="0" y1="0" x2="233" y2="-233" stroke="#d9d2c3" strokeWidth="1.5" />
          <path d="M-233 -233 C -250 -330, -120 -400, 0 -405 C 120 -400, 250 -330, 233 -233" fill="none" stroke="#1A1A1A" strokeWidth="2.5" />
          {usable.map((p, i) => {
            const { x, y } = ft(p)
            const hr = p.ev === 'home_run', hit = HIT.has(p.ev ?? '')
            return hr
              ? <circle key={i} cx={x} cy={-y} r={6} fill="#fff" fillOpacity={0.6} stroke="#FF5722" strokeWidth={2} />
              : <circle key={i} cx={x} cy={-y} r={hit ? 4 : 3} fill={hit ? '#1D9E75' : '#B7AE9C'} fillOpacity={hit ? 0.85 : 0.6} />
          })}
          <circle cx="0" cy="0" r="4" fill="#1A1A1A" />
        </svg>
        <figcaption style={{ fontSize: 13, color: MUTE }}>
          Orange ring = home run · green dot = other hit · grey dot = out. n = {n.toLocaleString('en-US')} balls in play{small ? <Star /> : null}. Position is where the ball came down, not how far it carried.
          <ThroughDate date={through} />
          {small ? <div>* Small sample size: under {MIN_SAMPLE.sprayBBE} balls in play. Read with caution.</div> : null}
        </figcaption>
      </figure>
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800 }}>Where the ball goes</h2>
        {[
          ...(pull != null && oppo != null ? [['Pull', pull], ['Center', centre], ['Oppo', oppo]] as [string, number][] : [['Left field', left], ['Center', centre], ['Right field', right]] as [string, number][]),
        ].map(([label, v]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 50px', alignItems: 'center', gap: 10, padding: '5px 0', borderTop: '1px solid #e7e2d8', fontSize: 15 }}>
            <b>{label}</b>
            <span style={{ background: '#f1eee6', height: 10, borderRadius: 5 }}><span style={{ display: 'block', height: 10, borderRadius: 5, background: '#1A1A1A', width: pct(v) }} /></span>
            <b style={{ textAlign: 'right' }}>{pct(v)}{small ? <Star /> : null}</b>
          </div>
        ))}
        <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>n = {n.toLocaleString('en-US')} balls in play. Thirds of the field by direction{bats === 'S' ? '; switch hitters show left and right field because pull depends on the pitcher’s hand' : ''}.</div>
      </div>
    </div>
  )
}
