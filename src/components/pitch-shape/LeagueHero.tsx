// src/components/pitch-shape/LeagueHero.tsx
//
// The banner at the top of the league view of the Pitch Shape Lab, built to match the pitcher's banner (PitcherHero) so the two feel like the same kind of place: here the pitch is the subject. A thumbnail of the
// pitch's league movement map stands where a headshot would, then the pitch, hand and level, a line on what the page shows, and a strip of league numbers (pitches, swings, whiffs per swing, typical speed, average shape).
// Server component, plain data in, no fetching. Describes what already happened; nothing here looks forward.
import { C } from '@/components/team/ui'
import HeroFlight from './HeroFlight'
import type { HeroStat } from './PitcherHero'

export default function LeagueHero({ flight, pitchName, handText, levelName, seasonLabel, stats, aside }: {
  /** the search and the filters, stacked in a column on the right of the banner */
  aside?: React.ReactNode
  /** the league-average shape of the pitch, animated where a headshot would stand */
  flight: { type: string; hb: number; ivb: number; mph: number; hand: 'R' | 'L' } | null; pitchName: string; handText: string; levelName: string; seasonLabel: string; stats: HeroStat[]; guideHref?: string
}) {
  return (
    <section aria-label={`${pitchName}, league view`} style={{ position: 'relative', background: '#fff', color: C.ink, border: `1px solid ${C.line}`, borderTop: `5px solid ${C.orange}`, borderRadius: 6, margin: '0 0 16px' }}>
      <div className="psl-hero" style={{ display: 'grid', gridTemplateColumns: aside ? 'auto minmax(0,1fr) minmax(250px, 320px)' : 'auto minmax(0,1fr)', gap: '14px 28px', alignItems: 'start', padding: '22px 28px' }}>
        <style>{'@media(max-width:1000px){.psl-hero{grid-template-columns:auto minmax(0,1fr) !important}}@media(max-width:700px){.psl-hero{grid-template-columns:minmax(0,1fr) !important;padding:18px !important}}'}</style>
        <div style={{ flex: 'none', alignSelf: 'center' }}>
          {flight ? <HeroFlight type={flight.type} name={pitchName} hb={flight.hb} ivb={flight.ivb} /> : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: C.orange }}>The league · {levelName} · {seasonLabel}</div>
          <h2 style={{ margin: '6px 0 4px', fontSize: 'clamp(34px, 5.6vw, 58px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{pitchName}</h2>
          <div style={{ fontSize: 15, color: '#5b5347' }}>{handText} pitchers. Where hitters miss it most, who throws each shape, and who is getting more or less than their shape usually produces.</div>
        </div>
        {aside && <aside className="psl-hero-aside" aria-label="Find a pitcher and filters" style={{ minWidth: 0, background: C.soft, border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, display: 'grid', gap: 12 }}>{aside}</aside>}
      </div>
      {stats.length > 0 && (
        <div className="psl-hero-stats" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 5)}, minmax(0, 1fr))`, background: C.soft, borderTop: `1px solid ${C.line}`, borderRadius: '0 0 5px 5px', overflow: 'hidden' }}>
          <style>{'@media(max-width:700px){.psl-hero-stats{grid-template-columns:repeat(2,minmax(0,1fr)) !important}}'}</style>
          {stats.map(s => (
            <div key={s.label} style={{ padding: '12px 18px', borderLeft: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, textTransform: 'uppercase', color: '#6b6355' }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11.5, color: '#5b5347' }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
