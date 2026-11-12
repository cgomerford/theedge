// src/components/pitch-shape/PitcherHero.tsx
//
// The arrival banner when a pitcher is chosen in the Pitch Shape Lab: his club's colours, his headshot, his club's badge, his name, hand, team and the pitch that is open, with a few numbers from his season and a
// way back. It makes choosing a pitcher feel like arriving at his page rather than filtering a table. Server component: plain data in, no fetching. Colours come from the club list (a minor leaguer takes his
// parent club's); with no club colour it falls back to the site's ink. Describes what happened; nothing here looks forward.
import Link from 'next/link'
import { C } from '@/components/team/ui'
import { MLB_TEAMS } from '@/lib/teams'
import { teamOf } from '@/lib/milb-shape/teams'
import { LEVEL_LABEL, isMilb, type Level } from '@/lib/milb-shape/levels'
import { TeamBadge } from '@/components/front-office/pitching/Avatar'
import PlayerPhoto from './PlayerPhoto'

export type HeroStat = { label: string; value: string; sub?: string }

export default function PitcherHero({ id, name, teamAbbr, hand, level, season, pitchName, stats, backHref }: {
  id: number; name: string; teamAbbr: string; hand: 'R' | 'L'; level: Level; season: number; pitchName: string; stats: HeroStat[]; backHref: string
}) {
  const t = teamOf(level, teamAbbr)
  const clubId = t ? (t.parentId ?? t.id) : null
  const club = clubId != null ? MLB_TEAMS.find(m => m.id === clubId) ?? null : null
  const bg = club?.primary_color ?? C.ink, fg = club?.text_on_primary ?? '#FFFFFF'
  const line = [t?.name ?? teamAbbr, `${hand === 'L' ? 'Left' : 'Right'}-handed pitcher`, isMilb(level) ? LEVEL_LABEL[level] : null, `${season} season`].filter(Boolean).join(' · ')
  return (
    <section aria-label={`${name}, pitch shape`} style={{ background: bg, color: fg, borderRadius: 6, overflow: 'hidden', margin: '0 0 16px', position: 'relative' }}>
      <div className="psl-hero" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '14px 24px', alignItems: 'end', padding: '22px 28px 0' }}>
        <style>{'@media(max-width:700px){.psl-hero{grid-template-columns:1fr !important;padding:18px 18px 0 !important}.psl-hero-photo{margin:0 auto !important}}'}</style>
        <div className="psl-hero-photo" style={{ width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,.16)', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flex: 'none' }}>
          <PlayerPhoto id={id} size={150} minor={isMilb(level)} round={false} />
        </div>
        <div style={{ minWidth: 0, paddingBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, fontWeight: 700, opacity: 0.92 }}>
            {t ? <span style={{ background: 'rgba(255,255,255,.92)', borderRadius: 999, padding: 3, display: 'inline-flex' }}><TeamBadge id={t.id} size={26} disc={false} /></span> : null}
            <span style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>{line}</span>
          </div>
          <h2 style={{ margin: '6px 0 4px', fontSize: 'clamp(34px, 5.6vw, 58px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{name}</h2>
          <div style={{ fontSize: 15, opacity: 0.92 }}>The story of his <b>{pitchName.toLowerCase()}</b>: its shape, who else throws it, how it changed, and why the results are what they are.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 12, fontSize: 14, fontWeight: 800 }}>
            <Link href={`/mlb/players/${id}`} style={{ color: fg, textDecoration: 'underline', textUnderlineOffset: 3 }}>Player page →</Link>
            <Link href={`/mlb/lab/pitching-lab/${id}`} style={{ color: fg, textDecoration: 'underline', textUnderlineOffset: 3 }}>Pitching Lab →</Link>
            <Link href={backHref} style={{ color: fg, textDecoration: 'underline', textUnderlineOffset: 3, marginLeft: 'auto' }}>← Back to the league view</Link>
          </div>
        </div>
      </div>
      {stats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 5)}, minmax(0, 1fr))`, background: 'rgba(0,0,0,.22)' }} className="psl-hero-stats">
          <style>{'@media(max-width:700px){.psl-hero-stats{grid-template-columns:repeat(2,minmax(0,1fr)) !important}}'}</style>
          {stats.map(s => (
            <div key={s.label} style={{ padding: '12px 18px', borderLeft: '1px solid rgba(255,255,255,.14)' }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, textTransform: 'uppercase', opacity: 0.85 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11.5, opacity: 0.85 }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
