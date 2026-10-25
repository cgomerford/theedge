// src/app/page.tsx
//
// Home. Server-rendered: today's games (starting pitchers + bullpen workload), MLB season
// leaders, latest articles and league news. One <h1>, no fade-ins, no NFL/ABS, no cards in cards.
//
// Slimmed down 2026-10: the old two-column "terminal" home (NFL ticker, ABS and bat-speed deep
// dives built from live Savant pulls, factor-count cards, a Free-vs-Pro block with launch dates)
// was removed. Those components still exist under src/components if a page needs them again.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import XMark from '@/components/XMark'
import SiteHeader from '@/components/SiteHeader'
import LiveTicker from '@/components/LiveTicker'
import PlayerSearch from '@/components/PlayerSearch'
import ArticlesTeaser from '@/components/ArticlesTeaser'
import NewsFeedSidebar from '@/components/NewsFeedSidebar'
import { BreadcrumbSchema } from '@/components/StructuredData'
import { getScheduleForDate, shortName, teamLogoUrl, slugifyGame } from '@/lib/mlb'
import { headshotUrl as pitcherHeadshotUrl } from '@/lib/mlb-assets'
import { getMLBNewsMultiSource } from '@/lib/mlb-homepage'
import { getSeasonLeaders } from '@/lib/mlb-leaders'
import { getBullpenPitches3dTotals } from '@/lib/bullpen'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { canonical } from '@/lib/seo'
import { signupHref } from '@/lib/site'

export const revalidate = 1800

export const metadata: Metadata = {
  title: { absolute: 'x9Lab: MLB game previews in plain numbers' },
  description:
    'Starting pitchers, bullpen workload and Statcast pitch data for every MLB game, in plain numbers with the sample size beside each stat. Free daily email.',
  alternates: { canonical: canonical('/') },
  openGraph: {
    title: 'x9Lab: MLB game previews in plain numbers',
    description:
      'Starting pitchers, bullpen workload and Statcast pitch data for every MLB game, in plain numbers with the sample size beside each stat. Free daily email.',
    url: canonical('/'),
  },
}

const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#FF5722', margin: 0 }
const MUTED = '#8A8577'

async function redirectSignedInHome() {
  const cookieStore = await cookies()
  if (!cookieStore.get('edge_session')?.value) return

  const sub = await getCurrentSubscriber()
  if (!sub) return

  const { data: subscriber, error } = await createAdminClient()
    .from('subscribers')
    .select('primary_team, teams')
    .eq('id', sub.id)
    .single()
  if (error) console.error('[redirectSignedInHome] Supabase error:', error.message)

  const primarySlug = subscriber?.primary_team ?? subscriber?.teams?.[0] ?? 'phillies'
  redirect(`/mlb/teams/${primarySlug}`)
}

function TeamPitcherRow({
  teamId,
  teamName,
  pitcher,
  bullpenPitches,
}: {
  teamId: number
  teamName: string
  pitcher?: { id: number; fullName: string }
  bullpenPitches?: number
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={teamLogoUrl(teamId)} alt="" width={24} height={24} style={{ objectFit: 'contain', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: 15 }}>{teamName}</span>
      </div>
      {pitcher ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pitcherHeadshotUrl(pitcher.id, 60)} alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover', border: '1px solid #DEDACE', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: MUTED }}><b style={{ color: '#1A1A1A' }}>SP</b> {pitcher.fullName}</span>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 4 }}>Starter not announced</div>
      )}
      {bullpenPitches !== undefined && (
        <div style={{ fontSize: 12, color: MUTED }}>
          Bullpen: <b style={{ color: '#1A1A1A' }}>{bullpenPitches}</b> pitches in the last 3 days
        </div>
      )}
    </div>
  )
}

export default async function HomePage() {
  await redirectSignedInHome()

  const today = new Date().toISOString().split('T')[0]

  const [games, news, hrLeaders, sbLeaders, bullpenPitches3d] = await Promise.all([
    getScheduleForDate(today),
    getMLBNewsMultiSource(),
    getSeasonLeaders('homeRuns', 5),
    getSeasonLeaders('stolenBases', 5),
    getBullpenPitches3dTotals(today),
  ])

  const slate = [...games].sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())

  return (
    <main style={{ minHeight: '100vh', background: '#FAF8F3', color: '#1A1A1A' }}>
      <style>{`
        .hm-wrap{max-width:1160px;margin:0 auto;padding:0 16px 48px}
        .hm-cols{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:40px}
        .hm-game{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 32px;padding:18px 0;border-top:1px solid #E8E4DC}
        .hm-links{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;font-weight:700}
        .hm-links a{color:#1A1A1A;text-decoration:underline;text-underline-offset:3px}
        @media (max-width:900px){.hm-cols{grid-template-columns:minmax(0,1fr)}}
        @media (max-width:560px){.hm-game{grid-template-columns:minmax(0,1fr)}}
      `}</style>

      <SiteHeader variant="home" />
      <LiveTicker />

      <div className="hm-wrap">
        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, margin: '32px 0 8px' }}>
          MLB game previews in plain numbers
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.5, color: '#5b5347', maxWidth: 640, margin: '0 0 20px' }}>
          Starting pitchers, bullpen workload and Statcast pitch data for every game, with the sample size shown next to each stat.
        </p>
        <div style={{ maxWidth: 420, marginBottom: 32 }}>
          <PlayerSearch sport="MLB" />
        </div>

        <div className="hm-cols">
          <section aria-labelledby="slate-h">
            <h2 id="slate-h" style={LABEL}><XMark /> Today&apos;s games</h2>
            {slate.length === 0 ? (
              <p style={{ fontSize: 14, color: MUTED, padding: '18px 0', borderTop: '1px solid #E8E4DC', marginTop: 12 }}>No MLB games scheduled today.</p>
            ) : (
              <div style={{ marginTop: 12 }}>
                {slate.map(game => {
                  const isFinal = game.status?.abstractGameState === 'Final'
                  const gameSlug = slugifyGame(game)
                  const away = shortName(game.teams.away.team.name)
                  const home = shortName(game.teams.home.team.name)
                  const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
                  return (
                    <article key={game.gamePk} className="hm-game">
                      <TeamPitcherRow
                        teamId={game.teams.away.team.id}
                        teamName={away}
                        pitcher={game.teams.away.probablePitcher}
                        bullpenPitches={bullpenPitches3d.get(game.teams.away.team.id)}
                      />
                      <TeamPitcherRow
                        teamId={game.teams.home.team.id}
                        teamName={home}
                        pitcher={game.teams.home.probablePitcher}
                        bullpenPitches={bullpenPitches3d.get(game.teams.home.team.id)}
                      />
                      <div className="hm-links">
                        <span style={{ color: MUTED, fontWeight: 600 }}>{gameTime} ET</span>
                        {isFinal ? (
                          <Link href={`/mlb/${gameSlug}/postgame`}>Postgame report</Link>
                        ) : (
                          <>
                            <Link href={`/mlb/${gameSlug}`}>Game preview</Link>
                            <Link href={`/mlb/${gameSlug}/scout-report`}>Scout report</Link>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <aside>
            <section aria-labelledby="leaders-h">
              <h2 id="leaders-h" style={LABEL}><XMark /> Season leaders</h2>
              {[
                { title: 'Home runs', rows: hrLeaders },
                { title: 'Stolen bases', rows: sbLeaders },
              ].map(board => (
                <div key={board.title} style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{board.title}</div>
                  {board.rows.length === 0 ? (
                    <div style={{ fontSize: 13, color: MUTED }}>No data yet.</div>
                  ) : (
                    board.rows.map(r => (
                      <Link
                        key={r.personId}
                        href={`/mlb/players/${r.personId}`}
                        style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid #E8E4DC', fontSize: 14, color: '#1A1A1A', textDecoration: 'none' }}
                      >
                        <span>{r.rank}. {r.name} <span style={{ color: MUTED, fontSize: 12 }}>{r.teamAbbr}</span></span>
                        <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.statValue}</b>
                      </Link>
                    ))
                  )}
                </div>
              ))}
            </section>

            <div style={{ marginTop: 28 }}>
              <h2 style={LABEL}><XMark /> Latest</h2>
              <ArticlesTeaser />
            </div>

            <NewsFeedSidebar items={news} />

            <p style={{ marginTop: 28, fontSize: 14 }}>
              <Link href={signupHref('home')} style={{ fontWeight: 800, color: '#1A1A1A', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Get the free daily email
              </Link>
            </p>
          </aside>
        </div>
      </div>
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }]} />
    </main>
  )
}
