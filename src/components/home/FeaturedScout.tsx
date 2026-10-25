import Link from 'next/link'
import { Headshot, TeamMark } from './Logo'
import SmallSample from '@/components/data/SmallSample'
import ThroughDate from '@/components/data/ThroughDate'
import { MIN_BF, type FeaturedScout as Featured, type StarterReadout } from '@/lib/mlb-homepage'

// The homepage hero: the day's most notable game as a scout report teaser. One h1 (the matchup), two starter rows,
// a "Through" line and one link. Server component; every number has its n beside or under it.

const MUTED = '#8a8275'
const n0 = (v: number) => v.toLocaleString('en-US')
const rate3 = (v: number) => v.toFixed(3).replace(/^0/, '')

function Stat({ label, value, n }: { label: string; value: string | null; n: number | null }) {
  const small = value == null || n == null || n < MIN_BF
  return (
    <div style={{ minWidth: 88 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>{label}</div>
      {small ? (
        <SmallSample n={n} />
      ) : (
        <>
          <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          <div style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>n {n0(n)} BF</div>
        </>
      )}
    </div>
  )
}

function Starter({ teamId, abbr, s }: { teamId: number; abbr: string; s: StarterReadout | null }) {
  if (!s) {
    return (
      <div style={{ padding: '16px 0', borderTop: '1px solid #e7e2d8', display: 'flex', alignItems: 'center', gap: 10 }}>
        <TeamMark id={teamId} abbr={abbr} />
        <span style={{ fontSize: 15, color: MUTED }}>Starter not announced</span>
      </div>
    )
  }
  const mixLine = s.mix.map(m => `${m.code} ${m.pct.toFixed(0)}%`).join(' · ')
  return (
    <div style={{ padding: '16px 0', borderTop: '1px solid #e7e2d8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Headshot id={s.id} name={s.name} />
        <span style={{ fontSize: 18, fontWeight: 800 }}>{s.name}</span>
        <TeamMark id={teamId} abbr={abbr} />
        {s.hand && <span style={{ fontSize: 14, color: MUTED, fontWeight: 700 }}>{s.hand}</span>}
      </div>
      <div style={{ marginTop: 10 }}>
        {s.mix.length > 0 && s.pitches > 0 ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mixLine}</div>
            <div style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>n {n0(s.pitches)} pitches</div>
          </>
        ) : (
          <SmallSample n={s.pitches} />
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', marginTop: 12 }}>
        <Stat label="ERA" value={s.era != null ? s.era.toFixed(2) : null} n={s.bf} />
        <Stat label="K%" value={s.kPct != null ? `${s.kPct.toFixed(1)}%` : null} n={s.bf} />
        <Stat label="xwOBA" value={s.xwoba != null ? rate3(s.xwoba) : null} n={s.bf} />
      </div>
    </div>
  )
}

export default function FeaturedScout({ data }: { data: Featured }) {
  return (
    <section aria-labelledby="featured-h" style={{ padding: '32px 0 8px' }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722' }}>
        {data.dateLabel ? `LAST GAME · ${data.dateLabel.toUpperCase()} · ` : ''}{data.kicker}
      </div>
      <h1 id="featured-h" style={{ margin: '8px 0 14px', fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
        {data.heading}
      </h1>
      <div className="hm-starters">
        <Starter teamId={data.away.id} abbr={data.away.abbr} s={data.away.starter} />
        <Starter teamId={data.home.id} abbr={data.home.abbr} s={data.home.starter} />
      </div>
      <div style={{ borderTop: '1px solid #e7e2d8', paddingTop: 12 }}>
        <ThroughDate date={data.throughDate} />
        {data.isFinal && data.away.score != null && data.home.score != null && (
          <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            Final: {data.away.abbr} {data.away.score}, {data.home.abbr} {data.home.score}
          </p>
        )}
        <Link
          href={`/mlb/${data.slug}/${data.isFinal ? 'postgame' : 'scout-report'}`}
          style={{ display: 'inline-block', marginTop: 8, fontSize: 16, fontWeight: 800, color: '#1A1A1A', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          {data.isFinal ? 'Read the postgame report' : 'Read the scout report'}
        </Link>
      </div>
    </section>
  )
}
