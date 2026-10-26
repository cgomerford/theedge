import Link from 'next/link'
import { TeamMark, Headshot } from '@/components/home/Logo'
import { MLB_TEAMS } from '@/lib/teams'
import type { PostLeaderGroup, StatOfDay } from '@/lib/mlb-home-dashboard'

const MUTED = '#8a8275'
const H: React.CSSProperties = { margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
const teamId = (abbr: string) => MLB_TEAMS.find(t => t.abbrev === abbr)?.id

export function PostseasonLeadersRail({ groups, year }: { groups: PostLeaderGroup[]; year: number }) {
  if (groups.every(g => g.rows.length === 0)) return null
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={H}>Postseason leaders</h2>
      {groups.map(g => g.rows.length > 0 && (
        <div key={g.label} style={{ borderTop: '1px solid #e7e2d8', padding: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: MUTED, textTransform: 'uppercase' }}>{g.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 6px' }}>
            <Headshot id={g.rows[0].id} name={g.rows[0].name} size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{g.rows[0].value}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: MUTED }}>{g.unit}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{g.rows[0].name} <span style={{ color: MUTED, fontWeight: 600 }}>{g.rows[0].team}</span></div>
            </div>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {g.rows.map((r, i) => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                <span style={{ width: 14, color: MUTED }}>{i + 1}</span>
                {teamId(r.team) && <TeamMark id={teamId(r.team)!} abbr={r.team} size={16} />}
                <Link href={`/mlb/players/${r.id}`} style={{ color: '#1A1A1A', fontWeight: 700, textDecoration: 'none' }}>{r.name}</Link>
                <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{r.value}</span>
                <span style={{ color: MUTED, fontSize: 12 }}>{r.games} G</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div style={{ fontSize: 12, color: MUTED }}>{year} postseason to date. G = games played.</div>
    </section>
  )
}

export function StatOfTheDayRail({ stat }: { stat: StatOfDay | null }) {
  if (!stat || !stat.hardest) return null
  const { hardest, longestHr } = stat
  const tid = teamId(hardest.team)
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={H}>Stat of the day</h2>
      <div style={{ borderTop: '1px solid #e7e2d8', paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: MUTED, textTransform: 'uppercase' }}>Hardest-hit ball, {day(stat.date)}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '2px 0 4px' }}>
          <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{hardest.mph.toFixed(1)}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: MUTED }}>mph</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <Headshot id={hardest.batterId} name={hardest.batter} size={28} />
          {tid && <TeamMark id={tid} abbr={hardest.team} size={18} />}
          <Link href={`/mlb/players/${hardest.batterId}`} style={{ color: '#1A1A1A', fontWeight: 800, textDecoration: 'none' }}>{hardest.batter}</Link>
          <span style={{ color: MUTED }}>{hardest.event}{hardest.feet != null ? `, ${Math.round(hardest.feet)} ft` : ''}</span>
        </div>
        {longestHr && (
          <div style={{ marginTop: 8, fontSize: 14 }}>
            Longest home run: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(longestHr.feet)} ft</b>, <Link href={`/mlb/players/${longestHr.batterId}`} style={{ color: '#1A1A1A', fontWeight: 700 }}>{longestHr.batter}</Link> ({longestHr.team})
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>Across {stat.games} finished game{stat.games === 1 ? '' : 's'}, n = {stat.n.toLocaleString('en-US')} tracked batted balls. Tracking data from the league&apos;s play-by-play.</div>
      </div>
    </section>
  )
}
