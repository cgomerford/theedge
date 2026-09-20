// src/components/team/HeroSection.tsx
//
// Top of the team page: who they are, where they stand, and a one-glance
// identity read built ONLY from ranks ("Rotation 1st in starter ERA"). The
// identity line is descriptive — no forecast, no odds, no Edge Score.

import type { Team } from '@/lib/teams'
import type { TeamProfile } from '@/lib/team-profile'
import { ordinal } from '@/lib/team-profile'
import { C, DISPLAY, MONO, teamLogo, SANS } from './ui'

function status(p: TeamProfile): { text: string; hot: boolean } | null {
  const s = p.row.st
  if (s.divChamp) return { text: 'Division champions', hot: true }
  if (s.clinched) return { text: 'Clinched a playoff spot', hot: true }
  if (/^\d+$/.test(s.elim)) return { text: `Elimination number ${s.elim}`, hot: false }
  if (/^\d+$/.test(s.magic)) return { text: `Magic number ${s.magic}`, hot: true }
  return null
}

export default function HeroSection({ team, profile: p }: { team: Team; profile: TeamProfile }) {
  const s = p.row.st
  const on = team.text_on_primary
  const st = status(p)
  const l10 = s.splits.lastTen
  const home = s.splits.home, away = s.splits.away
  const streakTone = s.streak.startsWith('W')

  const stat = (label: string, value: string, sub?: string) => (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: on, opacity: 0.6 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, lineHeight: 1.1, color: on }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: on, opacity: 0.65 }}>{sub}</div>}
    </div>
  )

  const best = p.headline.best
  const worst = p.headline.worst && (p.headline.worst.metric.rank as number) >= 21 ? p.headline.worst : null

  return (
    <div style={{ background: team.primary_color, borderRadius: 16, padding: '30px 34px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
        <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teamLogo(team.id)} alt={team.name} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: C.yellow, marginBottom: 6 }}>⊕ Team profile · {team.league} {team.division} · {p.season}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(34px, 5.6vw, 56px)', lineHeight: 1, color: on, letterSpacing: '-.02em' }}>{team.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10, fontFamily: MONO, fontSize: 12, color: on }}>
            <span style={{ opacity: 0.85 }}>{ordinal(s.divRank)} in {team.league} {team.division} · {s.gb === '-' ? 'leads the division' : `${s.gb} GB`}</span>
            {st && (
              <span style={{ background: st.hot ? C.yellow : 'rgba(255,255,255,.18)', color: st.hot ? '#1A1A1A' : on, padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{st.text}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px 38px', marginTop: 24 }}>
        {stat('Record', `${s.w}–${s.l}`, `.${String(Math.round(s.pct * 1000)).padStart(3, '0')} · ${ordinal(s.sportRank)} in MLB`)}
        {stat('Run diff', `${s.diff > 0 ? '+' : ''}${s.diff}`, `${s.rs} RS · ${s.ra} RA`)}
        {stat('Streak', s.streak || '—', streakTone ? 'winning' : 'losing')}
        {l10 && stat('Last 10', `${l10.w}–${l10.l}`)}
        {home && away && stat('Home / road', `${home.w}–${home.l}`, `road ${away.w}–${away.l}`)}
        {p.pythag && stat('Pythagorean', `${p.pythag.expectedW.toFixed(0)}–${p.pythag.expectedL.toFixed(0)}`, 'record their run diff implies')}
      </div>

      {best.length > 0 && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.2)', fontFamily: SANS, fontSize: 15, color: on, lineHeight: 1.55, maxWidth: 900 }}>
          <span style={{ opacity: 0.7 }}>What defines them: </span>
          {best.map((b, i) => (
            <span key={b.unit}>{i > 0 ? ' and ' : ''}<strong>{b.unit.toLowerCase()}</strong> ({ordinal(b.metric.rank as number)} in {b.metric.label})</span>
          ))}
          {worst ? <>. The biggest question mark: <strong>{worst.unit.toLowerCase()}</strong> ({ordinal(worst.metric.rank as number)} in {worst.metric.label}).</> : <>. No unit ranks in the bottom third of MLB.</>}
        </div>
      )}
    </div>
  )
}
