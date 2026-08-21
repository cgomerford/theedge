'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { NFLGame } from '@/lib/nfl-schedule'
import QBRoomHeatmap from '@/components/nfl/QBRoomHeatmap'
import type { SeasonQBRoom } from '@/lib/nfl/qb-room-season'
import type { EdgeModelResult } from '@/lib/nfl/edge-model'

type Props = {
  game: NFLGame
  edgeModel: EdgeModelResult
  awaySeasonQB: SeasonQBRoom | null
  homeSeasonQB: SeasonQBRoom | null
}

function TabQBRoom({ game, awaySeasonQB, homeSeasonQB }: { game: NFLGame; awaySeasonQB: SeasonQBRoom | null; homeSeasonQB: SeasonQBRoom | null }) {
  if (!awaySeasonQB && !homeSeasonQB) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 32, textAlign: 'center' }}>
        <span className="s" style={{ fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No completed games with passing data yet this season.</span>
      </div>
    )
  }

  return (
    <div>
      <div className="m" style={{ fontSize: 9, color: '#A3A3A3', lineHeight: 1.6, marginBottom: 20, background: 'rgba(217,119,6,0.05)', borderLeft: '3px solid #D97706', padding: '10px 14px' }}>
        Season-to-date across every completed game — currently preseason only. Will automatically extend to include regular-season games once they're played, no separate view needed.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        {awaySeasonQB && (
          <div>
            <div className="m" style={{ fontSize: 9, color: '#A3A3A3', marginBottom: 8 }}>{awaySeasonQB.gamesPlayed} game{awaySeasonQB.gamesPlayed !== 1 ? 's' : ''} played</div>
            <QBRoomHeatmap
              qbName={awaySeasonQB.name}
              teamAbbr={game.awayTeam.abbreviation}
              summary={awaySeasonQB.summary}
              redZonePlays={[]}
              targets={[]}
              trails={awaySeasonQB.trails}
            />
          </div>
        )}
        {homeSeasonQB && (
          <div>
            <div className="m" style={{ fontSize: 9, color: '#A3A3A3', marginBottom: 8 }}>{homeSeasonQB.gamesPlayed} game{homeSeasonQB.gamesPlayed !== 1 ? 's' : ''} played</div>
            <QBRoomHeatmap
              qbName={homeSeasonQB.name}
              teamAbbr={game.homeTeam.abbreviation}
              summary={homeSeasonQB.summary}
              redZonePlays={[]}
              targets={[]}
              trails={homeSeasonQB.trails}
            />
          </div>
        )}
      </div>
    </div>
  )
}
const CSS = `
  .gp-page { background: #FAF8F3; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; color: #1A1A1A; }
  .m { font-family: 'JetBrains Mono', monospace; }
  .s { font-family: 'Fraunces', serif; }
  .b { font-family: 'Bebas Neue', sans-serif; }
  .gp-main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }
`

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function MatchupHeader({ game }: { game: NFLGame }) {
  const isFinal = game.status === 'final'
  const isLive = game.status === 'in_progress'

  return (
    <div style={{ padding: '24px 0', borderBottom: '1px solid rgba(26,26,26,0.1)', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link href="/nfl" className="m" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#A3A3A3', textDecoration: 'none' }}>NFL</Link>
        <span className="m" style={{ fontSize: 9, color: '#D4D0C8' }}>/</span>
        <span className="m" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#A3A3A3' }}>{game.season} · Week {game.week}</span>
        {isFinal && <span className="m" style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(26,26,26,0.06)', color: '#78716C', textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: 4 }}>Final</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <img src={game.awayTeam.logo} alt="" width={56} height={56} style={{ flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
          <div style={{ minWidth: 0 }}>
            <div className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Away</div>
            <div className="s" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{game.awayTeam.shortName}</div>
            <div className="m" style={{ fontSize: 11, color: '#A3A3A3', marginTop: 3 }}>{game.awayTeam.record}</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', flexShrink: 0, padding: '0 24px' }}>
          {isFinal || isLive ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
                <span className="b" style={{ fontSize: 44, lineHeight: 1 }}>{game.awayScore ?? 0}</span>
                <span className="m" style={{ fontSize: 18, color: '#D4D0C8' }}>–</span>
                <span className="b" style={{ fontSize: 44, lineHeight: 1 }}>{game.homeScore ?? 0}</span>
              </div>
              <div className="m" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, color: isLive ? '#15803D' : '#78716C' }}>{isLive ? '● Live' : 'Final'}</div>
            </div>
          ) : (
            <div>
              <div className="s" style={{ fontSize: 24, color: '#D4D0C8', fontWeight: 400 }}>vs</div>
              <div className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{game.statusDisplay}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 0, textAlign: 'right' }}>
            <div className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Home</div>
            <div className="s" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{game.homeTeam.shortName}</div>
            <div className="m" style={{ fontSize: 11, color: '#A3A3A3', marginTop: 3 }}>{game.homeTeam.record}</div>
          </div>
          <img src={game.homeTeam.logo} alt="" width={56} height={56} style={{ flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0' }} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <span className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{formatDate(game.date)}{game.venue ? ` · ${game.venue}` : ''}</span>
      </div>
    </div>
  )
}

function componentLabel(key: string): string {
  const labels: Record<string, string> = {
    recordDiff: 'Record',
    standing: 'Division Standing',
    homeField: 'Home Field',
    starterContinuity: 'Starter Continuity',
  }
  return labels[key] ?? key
}

function factorDescription(key: string, val: number, homeAbbr: string, awayAbbr: string): string {
  const leans = val > 0 ? homeAbbr : val < 0 ? awayAbbr : null
  switch (key) {
    case 'recordDiff':
      return leans ? `Better record leans ${leans}` : 'Records are even'
    case 'standing':
      return leans ? `Division standing leans ${leans}` : 'Even division standing'
    case 'homeField':
      return `Home field leans ${homeAbbr}`
    case 'starterContinuity':
      return leans ? `Confirmed starter leans ${leans}` : 'Starter status even on both sides'
    default:
      return ''
  }
}

function TabEdgeModel({ game, edgeModel }: { game: NFLGame; edgeModel: EdgeModelResult }) {
  const { components, confidenceTier, score } = edgeModel
  const homeAbbr = game.homeTeam.abbreviation
  const awayAbbr = game.awayTeam.abbreviation

  // Factor-count tally, not the raw score — this is what's allowed on a
  // public page per the model's own rules (Edge Score is internal only).
  const entries = Object.entries(components)
  const leaningHome = entries.filter(([, v]) => v > 0).length
  const leaningAway = entries.filter(([, v]) => v < 0).length
  const total = entries.length

  const leanTeam = leaningHome > leaningAway ? homeAbbr : leaningAway > leaningHome ? awayAbbr : null
  const leanCount = Math.max(leaningHome, leaningAway)

  return (
    <div>
      <div style={{ background: '#1A1A1A', padding: '28px 24px', marginBottom: 24 }}>
        <div className="m" style={{ fontSize: 9, color: '#FF5722', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>⊕ Edge Model V1</div>
        <div className="s" style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
          {leanTeam
            ? <>{leanCount} of {total} factors lean <span style={{ color: '#FF5722' }}>{leanTeam}</span></>
            : 'Factors are evenly split'}
        </div>
        <div className="m" style={{ fontSize: 10, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10 }}>
          Confidence: {confidenceTier}
        </div>
      </div>

      <div className="m" style={{ fontSize: 9, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>§ Factor breakdown</div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
        {entries.map(([key, val], i) => {
          const leans = val > 0 ? homeAbbr : val < 0 ? awayAbbr : null
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < entries.length - 1 ? '1px solid rgba(26,26,26,0.06)' : 'none' }}>
              <span className="s" style={{ fontSize: 13, fontWeight: 600 }}>{componentLabel(key)}</span>
              <span className="m" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: leans ? '#FF5722' : '#A3A3A3' }}>
                {leans ? `Leans ${leans}` : 'Even'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="m" style={{ fontSize: 9, color: '#A3A3A3', lineHeight: 1.6, marginTop: 16, background: 'rgba(217,119,6,0.05)', borderLeft: '3px solid #D97706', padding: '10px 14px' }}>
        V1 model — record differential, division standing, home field, and starter continuity. Preseason samples are small; treat as directional, not predictive.
      </div>
    </div>
  )
}

const TABS = [
  { key: 'model', label: 'Edge Model' },
  { key: 'qbroom', label: 'QB Room' },
] as const
type TabKey = typeof TABS[number]['key']

export default function NFLGamePage({ game, edgeModel, awaySeasonQB, homeSeasonQB }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('model')
  return (
    <div className="gp-page">
      <style>{CSS}</style>
      <div className="gp-main">
        <MatchupHeader game={game} />

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(26,26,26,0.1)', marginBottom: 24 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="m"
              style={{
                fontSize: 10, fontWeight: activeTab === tab.key ? 700 : 400, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '10px 16px', border: 'none', cursor: 'pointer', background: 'transparent',
                color: activeTab === tab.key ? '#FF5722' : '#A3A3A3',
                borderBottom: activeTab === tab.key ? '2px solid #FF5722' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

      {activeTab === 'model' && <TabEdgeModel game={game} edgeModel={edgeModel} />}
      {activeTab === 'qbroom' && <TabQBRoom game={game} awaySeasonQB={awaySeasonQB} homeSeasonQB={homeSeasonQB} />}
    </div>
    </div>
  )
}