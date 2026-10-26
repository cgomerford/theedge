import Link from 'next/link'
import { TeamMark } from '@/components/home/Logo'
import { MLB_TEAMS } from '@/lib/teams'
import type { BracketSeries, DashDivision, SeasonState } from '@/lib/mlb-home-dashboard'

// Postseason: the bracket by round, each series with a first-to-N progress bar per team. Regular season: six divisions with
// last-10 record and a run-differential bar, plus a wild-card line per league. Off-season: the final bracket, then final standings.

const MUTED = '#8a8275'
const colorOf = (id: number) => MLB_TEAMS.find(t => t.id === id)?.primary_color ?? '#1A1A1A'
const ROUND_NAME = { WC: 'Wild Card', DS: 'Division Series', LCS: 'League Championship', WS: 'World Series' } as const

function Bar({ id, wins, firstTo }: { id: number; wins: number; firstTo: number }) {
  return (
    <span style={{ display: 'flex', gap: 3 }} aria-hidden="true">
      {Array.from({ length: firstTo }, (_, i) => <span key={i} style={{ flex: 1, height: 8, background: i < wins ? colorOf(id) : '#e7e2d8' }} />)}
    </span>
  )
}

function Bracket({ series }: { series: BracketSeries[] }) {
  const rounds = (['WC', 'DS', 'LCS', 'WS'] as const).filter(r => series.some(s => s.round === r))
  return (
    <div className="bs-bracket">
      {rounds.map(r => (
        <div key={r}>
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: MUTED }}>{ROUND_NAME[r]}</h3>
          {series.filter(s => s.round === r).map(s => (
            <div key={`${s.a.id}-${s.b.id}`} style={{ padding: '10px 0', borderTop: '1px solid #e7e2d8' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{s.text}</div>
              <div style={{ display: 'grid', gap: 5, margin: '6px 0 4px' }}>
                {[s.a, s.b].map(t => (
                  <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{t.abbr}</span>
                    <Bar id={t.id} wins={t.wins} firstTo={s.firstTo} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{s.a.abbr} {s.a.wins}w · {s.b.abbr} {s.b.wins}w · first to {s.firstTo}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Standings({ divisions }: { divisions: DashDivision[] }) {
  const maxRd = Math.max(1, ...divisions.flatMap(d => d.teams.map(t => Math.abs(t.rd))))
  const wc = (league: 'AL' | 'NL') => divisions.filter(d => d.league === league).flatMap(d => d.teams).filter(t => t.wcRank != null).sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99)).slice(0, 5)
  return (
    <div>
      <div className="bs-divs">
        {divisions.map(d => (
          <div key={d.name}>
            <h3 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{d.name}</h3>
            {d.teams.map(t => (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px,1.1fr) 56px 44px 44px minmax(60px,1fr)', gap: 6, alignItems: 'center', padding: '6px 0', borderTop: '1px solid #e7e2d8', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontWeight: 800 }}><TeamMark id={t.id} abbr={t.abbr} size={18} /></span>
                <span>{t.w}-{t.l}</span>
                <span style={{ color: MUTED }}>{t.gb}</span>
                <span style={{ color: MUTED }}>{t.l10 ?? '—'}</span>
                <span style={{ display: 'grid', gridTemplateColumns: '1fr 38px', gap: 4, alignItems: 'center' }}>
                  <span aria-hidden="true" style={{ position: 'relative', height: 8, background: '#f1eee6' }}>
                    <span style={{ position: 'absolute', top: 0, bottom: 0, left: t.rd >= 0 ? '50%' : `${50 - (Math.abs(t.rd) / maxRd) * 50}%`, width: `${(Math.abs(t.rd) / maxRd) * 50}%`, background: t.rd >= 0 ? '#1D9E75' : '#FF5722' }} />
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 12 }}>{t.rd > 0 ? `+${t.rd}` : t.rd}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED }}>Columns: record · games back · last 10 · run differential (green ahead, orange behind).</p>
      <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 14 }}>
        {(['AL', 'NL'] as const).map(league => (
          <div key={league}><b>{league} wild card:</b> {wc(league).map(t => `${t.abbr} ${t.wcGb && t.wcGb !== '-' ? t.wcGb : '—'}`).join(' · ')}</div>
        ))}
        <div style={{ fontSize: 12, color: MUTED }}>Games ahead (+) or back of the third wild-card spot, as the league reports them.</div>
      </div>
    </div>
  )
}

export default function BracketOrStandings({ season, bracket, divisions }: { season: SeasonState; bracket: BracketSeries[]; divisions: DashDivision[] }) {
  const post = season.state === 'postseason'
  const off = season.state === 'offseason' || season.state === 'preseason'
  return (
    <section aria-labelledby="bs-h" style={{ marginTop: 34 }}>
      <style>{`
        .bs-bracket{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px 28px}
        .bs-divs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 28px}
        @media (max-width:900px){.bs-bracket{grid-template-columns:repeat(2,minmax(0,1fr))}.bs-divs{grid-template-columns:minmax(0,1fr)}}
      `}</style>
      <h2 id="bs-h" style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 800 }}>{post ? 'Postseason' : off ? `${season.year} final bracket and standings` : 'Standings'}</h2>
      {(post || off) && bracket.length > 0 && <Bracket series={bracket} />}
      {!post && divisions.length > 0 && <div style={{ marginTop: off ? 28 : 0 }}><Standings divisions={divisions} /></div>}
      {!post && divisions.length === 0 && <p style={{ color: MUTED, fontSize: 14 }}>Standings are not available right now.</p>}
      <p style={{ margin: '10px 0 0', fontSize: 14 }}><Link href="/mlb/stats" style={{ color: '#FF5722', fontWeight: 800 }}>Full standings and leaderboards in Stats →</Link></p>
    </section>
  )
}
