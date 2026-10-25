import Link from 'next/link'
import { Headshot, TeamMark } from './Logo'
import SmallSample from '@/components/data/SmallSample'
import ThroughDate, { formatThrough } from '@/components/data/ThroughDate'
import { MIN_BF, type FeaturedScout as Featured, type MixRow } from '@/lib/mlb-homepage'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchColor } from '@/lib/mlb'

// The homepage hero: one starter from the day's most notable game, as a scout report teaser. Server component.
// Layout follows the approved mockup: kicker + date, headline (the starter vs the other club), a one-line summary built
// from the data, four stat tiles on the left, the pitch mix on the right. Every number has its n beside or under it.

const MUTED = '#8a8275'
const INK = '#1A1A1A'
const n0 = (v: number) => v.toLocaleString('en-US')

function Tile({ label, bar, value, n, small, sub }: { label: string; bar: string; value: string; n?: string; small?: React.ReactNode; sub?: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${bar}`, paddingLeft: 12, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>{label}</div>
      {small ?? (
        <>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          {n && <div style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{n}</div>}
        </>
      )}
      {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function summary(d: Featured): string {
  const mix = d.starter.mix
  const top = mix[0]
  const parts: string[] = []
  if (top) {
    parts.push(top.usagePct > 50 ? `More than half his pitches are ${top.many}` : `His most-used pitch is the ${top.one} (${top.usagePct.toFixed(0)}%)`)
    const best = bestMiss(mix)
    if (best) parts[0] += `, and the ${best.one} is the pitch that misses most bats`
    parts[0] += '.'
  }
  if (d.opp.starterLast) parts.push(`${d.opp.starterLast} starts for ${d.opp.city}.`)
  return parts.join(' ')
}

function bestMiss(mix: MixRow[]): MixRow | null {
  const ok = mix.filter(m => m.missPct != null && m.n >= MIN_SAMPLE.arsenalPitchesPerType)
  return ok.length ? ok.reduce((a, b) => ((b.missPct ?? 0) > (a.missPct ?? 0) ? b : a)) : null
}

export default function FeaturedScout({ data }: { data: Featured }) {
  const s = data.starter
  const fastball = s.mix.find(m => m.code === 'FF') ?? s.mix.find(m => m.code === 'SI') ?? s.mix.find(m => m.code === 'FC') ?? null
  const miss = bestMiss(s.mix)
  const bfSmall = s.bf == null || s.bf < MIN_BF
  const total = s.mix.reduce((a, m) => a + m.usagePct, 0)
  const line = summary(data)

  return (
    <section aria-labelledby="featured-h" style={{ border: `2px solid ${INK}`, borderRadius: 18, padding: 'clamp(16px, 3vw, 28px)', margin: '20px 0 16px', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px 16px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', color: '#FF5722' }}>{data.kicker}</div>
        <div style={{ fontSize: 13, color: MUTED }}>{data.meta}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 6px' }}>
        <Headshot id={s.id} name={s.name} size={64} />
        <div style={{ minWidth: 0 }}>
          <h1 id="featured-h" style={{ margin: 0, fontSize: 'clamp(28px, 4.6vw, 44px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            {s.name} vs the {data.opp.short}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', marginTop: 6, fontSize: 14, color: '#5b5347' }}>
            <TeamMark id={s.teamId} abbr={s.teamAbbr} size={20} />
            {s.hand && <span>{s.hand}</span>}
            {s.wins != null && s.losses != null && s.era != null && <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.wins}-{s.losses}, {s.era.toFixed(2)} ERA</span>}
            {s.ip != null && !bfSmall && <span style={{ fontVariantNumeric: 'tabular-nums' }}>n {s.ip} IP</span>}
            {bfSmall && <SmallSample n={s.bf} />}
          </div>
        </div>
      </div>

      {line && <p style={{ margin: '14px 0 18px', fontSize: 16, lineHeight: 1.5, color: '#3a352c', maxWidth: 640 }}>{line}</p>}

      <div className="hm-hero-cols">
        <div>
          <div className="hm-tiles">
            {fastball && (
              <Tile
                label="Fastball share" bar="#FF5722" value={`${fastball.usagePct.toFixed(1)}%`} n={`n ${n0(fastball.n)} pitches`}
                small={fastball.n < MIN_SAMPLE.arsenalPitchesPerType ? <SmallSample n={fastball.n} /> : undefined}
              />
            )}
            {miss && (
              <Tile label={`${miss.label} miss rate`} bar="#a855a8" value={`${(miss.missPct ?? 0).toFixed(1)}%`} n={`n ${n0(miss.n)} pitches`} />
            )}
            <Tile
              label="Contact allowed" bar={INK} value={s.xwoba != null ? s.xwoba.toFixed(3).replace(/^0/, '') : ''} n={`xwOBA · n ${n0(s.bf ?? 0)} BF`}
              small={bfSmall || s.xwoba == null ? <SmallSample n={s.bf} /> : undefined}
            />
            {data.h2h && (
              <Tile
                label={`Most ${data.opp.short} PA vs him`} bar="#FDE047" value={String(data.h2h.pa)}
                sub={data.h2h.pa < MIN_SAMPLE.h2hPA ? `${data.h2h.name}, under ${MIN_SAMPLE.h2hPA} PA, no H2H line` : `${data.h2h.name}: ${data.h2h.avg ?? ''} AVG, ${data.h2h.ops ?? ''} OPS`}
              />
            )}
          </div>
          <div style={{ marginTop: 14 }}><ThroughDate date={data.throughDate} /></div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.14em', color: MUTED, marginBottom: 8 }}>HIS PITCH MIX</div>
          {s.mix.length > 0 && s.pitches > 0 ? (
            <>
              <div aria-hidden="true" style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden' }}>
                {s.mix.map(m => <span key={m.code} style={{ width: `${(m.usagePct / total) * 100}%`, background: pitchColor(m.code) }} />)}
              </div>
              <div className="hm-mix">
                {s.mix.map(m => (
                  <div key={m.code} className="hm-mixrow">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
                      <span aria-hidden="true" style={{ width: 10, height: 10, background: pitchColor(m.code), display: 'inline-block' }} />{m.label}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.usagePct.toFixed(1)}%</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.velo != null ? `${m.velo.toFixed(1)} mph` : ''}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {m.n < MIN_SAMPLE.arsenalPitchesPerType || m.missPct == null ? <SmallSample n={m.n} /> : <><b>{m.missPct.toFixed(1)}%</b> miss</>}
                    </span>
                    <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>n {n0(m.n)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>n = pitches thrown · Through {formatThrough(data.throughDate) ?? ''}</div>
            </>
          ) : (
            <SmallSample n={s.pitches} />
          )}
        </div>
      </div>

      <Link
        href={`/mlb/${data.slug}/${data.isFinal ? 'postgame' : 'scout-report'}`}
        style={{ display: 'inline-block', marginTop: 20, background: '#FF5722', color: '#fff', fontWeight: 800, fontSize: 15, padding: '11px 18px', borderRadius: 8, textDecoration: 'none' }}
      >
        {data.isFinal ? 'Read the postgame report' : 'Read the scout report'} →
      </Link>
    </section>
  )
}
