// src/components/admin/LiveTrackerBoard.tsx
//
// v5 — the flat auto-wrap card grid read as "scattered boxes" rather than
// something designed to be screenshotted whole, so each panel is now
// structured like an actual dashboard: a scoreboard banner (logos, score,
// inning) + mini linescore at the top — so the panel is self-explanatory
// even screenshotted on its own — then stats grouped into Pitching /
// Batting / Game Flow sections instead of one undifferentiated grid.
// Headshots are bigger and egg-shaped (a deliberate oval crop, not a
// distorted circle) rather than the small perfect circles from v4.

'use client'

import { useEffect, useRef, useState } from 'react'
import type { GameKeyStats, LiveGamePanel, LiveTrackerPayload, NotableEvent } from '@/types/live-tracker'
import { headshotUrl, teamLogoUrl } from '@/lib/mlb-assets'

const POLL_MS = 30_000

const CATEGORY_LABEL: Record<NotableEvent['category'], string> = {
  'no-hitter-watch': 'No-Hitter Watch',
  'perfect-game-watch': 'Perfect Game Watch',
  'strikeout-milestone': 'Strikeout Milestone',
  'multi-hr': 'Multi-HR',
  'cycle-watch': 'Cycle Watch',
  'todays-fastest-pitch': "Today's Fastest Pitch",
  'todays-hardest-hit': "Today's Hardest Hit",
  'blowout': 'Blowout',
  'walk-off-watch': 'Walk-Off Watch',
  'extra-innings': 'Extra Innings',
}

function TeamLogo({ teamId, abbr, size = 24 }: { teamId: number; abbr: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <span className="tl-fallback" style={{ width: size, height: size, fontSize: size * 0.34 }}>{abbr}</span>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={teamLogoUrl(teamId)} alt={abbr} width={size} height={size} className="tl-logo" onError={() => setFailed(true)} />
  )
}

// Small circular headshot — width == height, flat 50% radius.
function Headshot({ playerId, name, size = 15 }: { playerId: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (failed) {
    return <span className="hs-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</span>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={headshotUrl(playerId, size * 3)} alt={name} width={size} height={size} className="hs-img" style={{ width: size, height: size }} onError={() => setFailed(true)} />
  )
}

export function LiveTrackerBoard() {
  const [payload, setPayload] = useState<LiveTrackerPayload | null>(null)
  const [error, setError] = useState(false)
  const [notifsEnabled, setNotifsEnabled] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const seenIds = useRef<Set<string>>(new Set())
  const [unseenByGame, setUnseenByGame] = useState<Set<number>>(new Set())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch('/api/admin/live-tracker', { cache: 'no-store' })
        if (!res.ok) throw new Error('bad response')
        const json: LiveTrackerPayload = await res.json()
        if (cancelled) return
        setPayload(json)
        setError(false)

        const allEvents = [...json.headlineEvents, ...json.panels.flatMap(p => p.events)]
        const fresh = allEvents.filter(e => !seenIds.current.has(e.id))
        if (fresh.length > 0) {
          fresh.forEach(e => seenIds.current.add(e.id))
          setUnseenByGame(prev => {
            const next = new Set(prev)
            fresh.forEach(e => next.add(e.gamePk))
            return next
          })
          if (notifsEnabled && 'Notification' in window && Notification.permission === 'granted') {
            fresh.forEach(e => {
              new Notification(CATEGORY_LABEL[e.category], { body: `${e.headline}\n${e.detail}` })
            })
          }
        }
      } catch {
        if (!cancelled) setError(true)
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifsEnabled])

  async function enableNotifications() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifsEnabled(perm === 'granted')
  }

  function toggle(gamePk: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(gamePk)) next.delete(gamePk)
      else next.add(gamePk)
      return next
    })
    setUnseenByGame(prev => {
      const next = new Set(prev)
      next.delete(gamePk)
      return next
    })
  }

  return (
    <div className="lt-wrap">
      <div className="lt-header">
        <div className="lt-title"><span className="lt-glyph">⊕</span> LIVE TRACKER</div>
        <div className="lt-actions">
          {!notifsEnabled && <button className="lt-btn" onClick={enableNotifications}>Enable notifications</button>}
          {notifsEnabled && <span className="lt-badge-on">🔔 on</span>}
          <span className="lt-asof">{payload ? new Date(payload.asOf).toLocaleTimeString() : error ? 'error' : '…'}</span>
        </div>
      </div>

      {payload && payload.headlineEvents.length > 0 && (
        <div className="lt-headline-strip">
          {payload.headlineEvents.map(e => (
            <span key={e.id} className="lt-headline-chip">{e.headline}</span>
          ))}
        </div>
      )}

      <div className="lt-sechead">§ Live ({payload?.panels.length ?? 0})</div>
      {payload && payload.panels.length === 0 && <div className="lt-empty">No games live right now.</div>}
      {payload?.panels.map(panel => (
        <GameRow
          key={panel.game.gamePk}
          panel={panel}
          isExpanded={expanded.has(panel.game.gamePk)}
          hasUnseen={unseenByGame.has(panel.game.gamePk)}
          onToggle={() => toggle(panel.game.gamePk)}
        />
      ))}

      {payload && payload.finishedPanels.length > 0 && (
        <>
          <div className="lt-sechead">§ Finished ({payload.finishedPanels.length})</div>
          {payload.finishedPanels.map(panel => (
            <GameRow
              key={panel.game.gamePk}
              panel={panel}
              isExpanded={expanded.has(panel.game.gamePk)}
              hasUnseen={false}
              onToggle={() => toggle(panel.game.gamePk)}
            />
          ))}
        </>
      )}

      {payload && payload.otherGames.length > 0 && (
        <>
          <div className="lt-sechead lt-sechead-secondary">§ Not Started Yet</div>
          {payload.otherGames.map(g => (
            <div key={g.gamePk} className="lt-other-row">
              <span className="lt-other-teams">
                <TeamLogo teamId={g.awayTeamId} abbr={g.awayAbbr} size={16} /> {g.awayAbbr} {g.awayScore} — {g.homeScore} {g.homeAbbr} <TeamLogo teamId={g.homeTeamId} abbr={g.homeAbbr} size={16} />
              </span>
              <span className="lt-other-status">{g.status}</span>
            </div>
          ))}
        </>
      )}

      <style>{`
        .lt-wrap { font-family: 'Inter', sans-serif; color: #1A1A1A; background: #FAF8F3; max-width: 860px; margin: 0 auto; padding: 20px; }
        .lt-header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #1A1A1A; padding-bottom: 10px; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
        .lt-title { font-family: 'Fraunces', serif; font-weight: 800; font-size: 17px; letter-spacing: -0.3px; }
        .lt-glyph { color: #FF5722; margin-right: 4px; }
        .lt-actions { display: flex; align-items: center; gap: 10px; }
        .lt-btn { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 1px; padding: 5px 10px; border: 1px solid #1A1A1A; background: #1A1A1A; color: #fff; cursor: pointer; border-radius: 0; }
        .lt-badge-on { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #15803d; }
        .lt-asof { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #6b6b66; }
        .lt-headline-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
        .lt-headline-chip { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; background: #1A1A1A; color: #FDE047; padding: 4px 9px; }
        .lt-sechead { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 1.4px; color: #FF5722; border-bottom: 1px solid #1A1A1A22; padding-bottom: 6px; margin: 14px 0 8px; }
        .lt-sechead-secondary { color: #6b6b66; }
        .lt-empty { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6b6b66; padding: 10px 0; }
        .lt-other-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6b6b66; border-bottom: 1px solid #E8E4DA; }
        .lt-other-teams { display: flex; align-items: center; gap: 5px; }
        .lt-other-status { text-transform: uppercase; font-size: 9px; }

        .tl-logo { object-fit: contain; vertical-align: middle; }
        .tl-fallback { display: inline-flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #E8E4DA; color: #6b6b66; vertical-align: middle; }
        .hs-img { object-fit: cover; border-radius: 50%; border: 1px solid #FF5722; background: #E8E4DA; flex-shrink: 0; }
        .hs-fallback { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; font-family: 'JetBrains Mono', monospace; font-weight: 700; background: #1A1A1A; color: #FDE047; flex-shrink: 0; border: 1px solid #FF5722; }

        .gr-wrap { border: 1px solid #E8E4DA; background: #fff; margin-bottom: 6px; }
        .gr-header { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: none; border: none; cursor: pointer; text-align: left; font-family: 'JetBrains Mono', monospace; }
        .gr-arrow { color: #6b6b66; transition: transform 0.15s; display: inline-block; }
        .gr-arrow-open { transform: rotate(90deg); color: #FF5722; }
        .gr-matchup { font-size: 12.5px; font-weight: 600; flex: 1; display: flex; align-items: center; gap: 6px; }
        .gr-matchup b { color: #FF5722; }
        .gr-inning { font-size: 10px; color: #6b6b66; }
        .gr-dot { width: 7px; height: 7px; border-radius: 50%; background: #FF5722; display: inline-block; }

        /* the whole expanded panel is deliberately framed as one self-
           contained graphic — this is the part meant to be screenshotted */
        .gr-panel { border-top: 2px solid #1A1A1A; background: #FAF8F3; }

        .sb-banner { background: #1A1A1A; color: #fff; padding: 16px 18px; display: flex; align-items: center; justify-content: center; gap: 20px; }
        .sb-team { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 130px; }
        .sb-team-name { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #cfcac0; text-align: center; }
        .sb-score { font-family: 'Bebas Neue', sans-serif; font-size: 48px; line-height: 1; }
        .sb-mid { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .sb-vs { font-family: 'Bebas Neue', sans-serif; font-size: 40px; color: #6b6b66; }
        .sb-inning { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #FDE047; text-transform: uppercase; letter-spacing: 1px; }

        .ls-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; background: #fff; }
        .ls-table th { padding: 5px 6px; text-align: center; color: #6b6b66; font-weight: 500; border-bottom: 1px solid #E8E4DA; }
        .ls-table td { padding: 5px 6px; text-align: center; }
        .ls-table td.ls-team { text-align: left; font-weight: 700; }
        .ls-table td.ls-total { font-weight: 700; color: #FF5722; }

        .dash-section { padding: 10px 10px 2px; }
        .dash-sechead { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1.2px; display: inline-block; padding: 3px 9px; margin-bottom: 8px; }
        .sec-pitching .dash-sechead { background: #FF5722; color: #fff; }
        .sec-pitching .stat-card { border-left: 3px solid #FF5722; background: #FFF8F6; }
        .sec-batting .dash-sechead { background: #FDE047; color: #1A1A1A; }
        .sec-batting .stat-card { border-left: 3px solid #FDE047; background: #FFFDF3; }
        .sec-flow .dash-sechead { background: #1A1A1A; color: #FDE047; }
        .sec-flow .stat-card { border-left: 3px solid #1A1A1A; background: #F7F6F3; }

        .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 6px; margin-bottom: 4px; }
        .stat-card { background: #fff; border: 1px solid #E8E4DA; padding: 7px 9px; display: flex; flex-direction: column; min-height: 68px; }
        .stat-card-empty { opacity: 0.4; }
        .stat-top { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
        .stat-label { font-family: 'JetBrains Mono', monospace; font-size: 7px; text-transform: uppercase; letter-spacing: 0.7px; color: #FF5722; }
        .stat-big { font-family: 'Bebas Neue', sans-serif; font-size: 18px; line-height: 1; color: #1A1A1A; }
        .stat-sub { font-family: Georgia, serif; font-size: 10.5px; color: #1A1A1A; margin-top: 1px; line-height: 1.25; }
        .stat-meta { font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #6b6b66; margin-top: 2px; }
        .stat-footer { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 5px; }
        .stat-copy { font-family: 'JetBrains Mono', monospace; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 6px; border: 1px solid #1A1A1A; background: #FAF8F3; cursor: pointer; border-radius: 0; }

        .dash-events { padding: 0 14px 14px; }
        .gr-events { display: flex; flex-direction: column; gap: 4px; }
        .gr-event { display: flex; gap: 8px; align-items: baseline; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; padding: 4px 0; border-top: 1px dashed #E8E4DA; }
        .gr-event-inning { color: #6b6b66; white-space: nowrap; }
        .gr-event-cat { color: #FF5722; text-transform: uppercase; letter-spacing: 0.5px; font-size: 8.5px; white-space: nowrap; }
        .gr-event-text { color: #1A1A1A; font-family: Georgia, serif; font-size: 12px; }
      `}</style>
    </div>
  )
}

function GameRow({ panel, isExpanded, hasUnseen, onToggle }: {
  panel: LiveGamePanel; isExpanded: boolean; hasUnseen: boolean; onToggle: () => void
}) {
  const { game, keyStats, events, linescore } = panel
  return (
    <div className="gr-wrap">
      <button className="gr-header" onClick={onToggle}>
        <span className={`gr-arrow ${isExpanded ? 'gr-arrow-open' : ''}`}>▸</span>
        <span className="gr-matchup">
          <TeamLogo teamId={game.awayTeamId} abbr={game.awayAbbr} />
          {game.awayAbbr} <b>{game.awayScore}</b> — <b>{game.homeScore}</b> {game.homeAbbr}
          <TeamLogo teamId={game.homeTeamId} abbr={game.homeAbbr} />
        </span>
        <span className="gr-inning">{game.status === 'Final' ? 'Final' : `${game.inningHalf === 'top' ? '▲' : '▼'}${game.inning ?? '—'}`}</span>
        {hasUnseen && <span className="gr-dot" title="New activity" />}
      </button>

      {isExpanded && (
        <div className="gr-panel">
          {/* scoreboard banner — the panel should read on its own if screenshotted alone */}
          <div className="sb-banner">
            <div className="sb-team">
              <TeamLogo teamId={game.awayTeamId} abbr={game.awayAbbr} size={48} />
              <div className="sb-score">{game.awayScore}</div>
              <div className="sb-team-name">{game.awayName}</div>
            </div>
            <div className="sb-mid">
              <span className="sb-vs">–</span>
              <span className="sb-inning">
                {game.status === 'Final' ? 'FINAL' : `${game.inningHalf === 'top' ? '▲ Top' : '▼ Bot'} ${game.inning ?? ''}`}
              </span>
            </div>
            <div className="sb-team">
              <TeamLogo teamId={game.homeTeamId} abbr={game.homeAbbr} size={48} />
              <div className="sb-score">{game.homeScore}</div>
              <div className="sb-team-name">{game.homeName}</div>
            </div>
          </div>

          {linescore.length === 2 && <MiniLinescore linescore={linescore} />}

          <div className="dash-section sec-pitching">
            <div className="dash-sechead">⚡ Pitching</div>
            <div className="stat-grid">
              <StatCard label="Fastest Pitch" empty={!keyStats.fastestPitch}
                headshot={keyStats.fastestPitch && { id: keyStats.fastestPitch.pitcherId, name: keyStats.fastestPitch.pitcherName }}
                big={keyStats.fastestPitch && `${keyStats.fastestPitch.speed} mph`}
                sub={keyStats.fastestPitch?.pitcherName}
                meta={keyStats.fastestPitch && `inning ${keyStats.fastestPitch.inning}`}></StatCard>
              

              <StatCard label="Slowest Pitch" empty={!keyStats.slowestPitch}
                headshot={keyStats.slowestPitch && { id: keyStats.slowestPitch.pitcherId, name: keyStats.slowestPitch.pitcherName }}
                big={keyStats.slowestPitch && `${keyStats.slowestPitch.speed} mph`}
                sub={keyStats.slowestPitch && `${keyStats.slowestPitch.typeDescription} — ${keyStats.slowestPitch.pitcherName}`}
                copyText={keyStats.slowestPitch && `${keyStats.slowestPitch.speed} mph ${keyStats.slowestPitch.typeDescription} — ${keyStats.slowestPitch.pitcherName} (${game.matchup})`} />

              <StatCard label="Most Break" empty={!keyStats.mostBreak}
                headshot={keyStats.mostBreak && { id: keyStats.mostBreak.pitcherId, name: keyStats.mostBreak.pitcherName }}
                big={keyStats.mostBreak && `${keyStats.mostBreak.breakLength}"`}
                sub={keyStats.mostBreak && `${keyStats.mostBreak.typeDescription} — ${keyStats.mostBreak.pitcherName}`}
                copyText={keyStats.mostBreak && `${keyStats.mostBreak.breakLength}" of break on the ${keyStats.mostBreak.typeDescription} — ${keyStats.mostBreak.pitcherName} (${game.matchup})`} />

              <StatCard label="Highest Spin" empty={!keyStats.highestSpin}
                headshot={keyStats.highestSpin && { id: keyStats.highestSpin.pitcherId, name: keyStats.highestSpin.pitcherName }}
                big={keyStats.highestSpin && `${keyStats.highestSpin.spinRate} rpm`}
                sub={keyStats.highestSpin?.pitcherName}
                copyText={keyStats.highestSpin && `${keyStats.highestSpin.spinRate} rpm — ${keyStats.highestSpin.pitcherName} (${game.matchup})`} />

              <StatCard label="Best Swing &amp; Miss" empty={!keyStats.topSwingAndMiss}
                headshot={keyStats.topSwingAndMiss && { id: keyStats.topSwingAndMiss.pitcherId, name: keyStats.topSwingAndMiss.pitcherName }}
                big={keyStats.topSwingAndMiss && `${keyStats.topSwingAndMiss.swStrPct}%`}
                sub={keyStats.topSwingAndMiss && `${keyStats.topSwingAndMiss.pitcherName}, ${keyStats.topSwingAndMiss.pitchesThrown}p`}
                copyText={keyStats.topSwingAndMiss && `${keyStats.topSwingAndMiss.pitcherName} is running a ${keyStats.topSwingAndMiss.swStrPct}% swinging-strike rate (${game.matchup})`} />
            </div>
          </div>

          <div className="dash-section sec-batting">
            <div className="dash-sechead">🔥 Batting</div>
            <div className="stat-grid">
              <StatCard label="Hardest Hit" empty={!keyStats.hardestHit}
                headshot={keyStats.hardestHit && { id: keyStats.hardestHit.batterId, name: keyStats.hardestHit.batterName }}
                big={keyStats.hardestHit && `${keyStats.hardestHit.exitVelo} mph`}
                sub={keyStats.hardestHit?.batterName}
                meta={keyStats.hardestHit && `inning ${keyStats.hardestHit.inning}`}
                copyText={keyStats.hardestHit && `${keyStats.hardestHit.exitVelo} mph off the bat of ${keyStats.hardestHit.batterName} (${game.matchup})`} />

              <StatCard label="Longest Hit" empty={!keyStats.longestHit}
                headshot={keyStats.longestHit && { id: keyStats.longestHit.batterId, name: keyStats.longestHit.batterName }}
                big={keyStats.longestHit && `${keyStats.longestHit.distance} ft`}
                sub={keyStats.longestHit?.batterName}
                copyText={keyStats.longestHit && `${keyStats.longestHit.distance} ft — ${keyStats.longestHit.batterName} (${game.matchup})`} />

              <StatCard label="Longest At-Bat" empty={!keyStats.longestAtBat}
                headshot={keyStats.longestAtBat && { id: keyStats.longestAtBat.batterId, name: keyStats.longestAtBat.batterName }}
                big={keyStats.longestAtBat && `${keyStats.longestAtBat.pitches} pitches`}
                sub={keyStats.longestAtBat && `${keyStats.longestAtBat.batterName} vs ${keyStats.longestAtBat.pitcherName}`}
                copyText={keyStats.longestAtBat && `${keyStats.longestAtBat.batterName} fought off ${keyStats.longestAtBat.pitches} pitches from ${keyStats.longestAtBat.pitcherName} (${game.matchup})`} />

              <StatCard label="Most Patient" empty={!keyStats.mostPatientBatter}
                headshot={keyStats.mostPatientBatter && { id: keyStats.mostPatientBatter.batterId, name: keyStats.mostPatientBatter.batterName }}
                big={keyStats.mostPatientBatter && `${keyStats.mostPatientBatter.pitchesSeen} pitches`}
                sub={keyStats.mostPatientBatter && `${keyStats.mostPatientBatter.batterName}, ${keyStats.mostPatientBatter.plateAppearances} PA`}
                copyText={keyStats.mostPatientBatter && `${keyStats.mostPatientBatter.batterName} has seen ${keyStats.mostPatientBatter.pitchesSeen} pitches in ${keyStats.mostPatientBatter.plateAppearances} PA (${game.matchup})`} />

              <StatCard label="RBI Leader" empty={!keyStats.rbiLeader}
                headshot={keyStats.rbiLeader && { id: keyStats.rbiLeader.batterId, name: keyStats.rbiLeader.batterName }}
                big={keyStats.rbiLeader && `${keyStats.rbiLeader.rbi} RBI`}
                sub={keyStats.rbiLeader?.batterName}
                copyText={keyStats.rbiLeader && `${keyStats.rbiLeader.batterName} — ${keyStats.rbiLeader.rbi} RBI (${game.matchup})`} />

              <StatCard label="Runs Leader" empty={!keyStats.runsLeader}
                headshot={keyStats.runsLeader && { id: keyStats.runsLeader.batterId, name: keyStats.runsLeader.batterName }}
                big={keyStats.runsLeader && `${keyStats.runsLeader.runs} run(s)`}
                sub={keyStats.runsLeader?.batterName}
                copyText={keyStats.runsLeader && `${keyStats.runsLeader.batterName} — ${keyStats.runsLeader.runs} run(s) scored (${game.matchup})`} />

              <StatCard label="Stolen Base Leader" empty={!keyStats.stolenBaseLeader}
                headshot={keyStats.stolenBaseLeader && { id: keyStats.stolenBaseLeader.batterId, name: keyStats.stolenBaseLeader.batterName }}
                big={keyStats.stolenBaseLeader && `${keyStats.stolenBaseLeader.stolenBases} SB`}
                sub={keyStats.stolenBaseLeader?.batterName}
                copyText={keyStats.stolenBaseLeader && `${keyStats.stolenBaseLeader.batterName} — ${keyStats.stolenBaseLeader.stolenBases} stolen base(s) (${game.matchup})`} />

              <StatCard label="Hard-Hit % By Team" empty={!keyStats.hardHitRate}
                big={keyStats.hardHitRate && `${keyStats.hardHitRate.awayPct}–${keyStats.hardHitRate.homePct}%`}
                sub={keyStats.hardHitRate && `${keyStats.hardHitRate.awayAbbr} vs ${keyStats.hardHitRate.homeAbbr}`}
                copyText={keyStats.hardHitRate && `Hard-hit rate: ${keyStats.hardHitRate.awayAbbr} ${keyStats.hardHitRate.awayPct}% — ${keyStats.hardHitRate.homeAbbr} ${keyStats.hardHitRate.homePct}%`} />
            </div>
          </div>

          <div className="dash-section sec-flow">
            <div className="dash-sechead">📊 Game Flow</div>
            <div className="stat-grid">
              <StatCard label="Biggest Inning" empty={!keyStats.biggestInning}
                logoTeamId={keyStats.biggestInning ? (keyStats.biggestInning.teamAbbreviation === game.awayAbbr ? game.awayTeamId : game.homeTeamId) : undefined}
                logoAbbr={keyStats.biggestInning?.teamAbbreviation}
                big={keyStats.biggestInning && `${keyStats.biggestInning.runs} runs`}
                sub={keyStats.biggestInning && `${keyStats.biggestInning.teamAbbreviation}, inning ${keyStats.biggestInning.inning}`}
                copyText={keyStats.biggestInning && `${keyStats.biggestInning.teamAbbreviation} scored ${keyStats.biggestInning.runs} runs in the ${keyStats.biggestInning.inning} (${game.matchup})`} />
            </div>
          </div>

          {events.length > 0 && (
            <div className="dash-events">
              <div className="dash-sechead">🚩 Notable</div>
              <div className="gr-events">
                {events.map(e => (
                  <div key={e.id} className="gr-event">
                    <span className="gr-event-inning">{e.halfInning === 'top' ? '▲' : '▼'}{e.inning}</span>
                    <span className="gr-event-cat">{CATEGORY_LABEL[e.category]}</span>
                    <span className="gr-event-text">{e.headline}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MiniLinescore({ linescore }: { linescore: LiveGamePanel['linescore'] }) {
  const maxInnings = Math.max(...linescore.map(r => r.runsByInning.length), 1)
  return (
    <table className="ls-table">
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>&nbsp;</th>
          {Array.from({ length: maxInnings }, (_, i) => <th key={i}>{i + 1}</th>)}
          <th>R</th><th>H</th><th>E</th>
        </tr>
      </thead>
      <tbody>
        {linescore.map(row => (
          <tr key={row.teamId}>
            <td className="ls-team">{row.abbreviation}</td>
            {Array.from({ length: maxInnings }, (_, i) => (
              <td key={i}>{row.runsByInning[i] ?? ''}</td>
            ))}
            <td className="ls-total">{row.runs}</td>
            <td>{row.hits}</td>
            <td>{row.errors}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StatCard({ label, big, sub, meta, empty, headshot, logoTeamId, logoAbbr, copyText }: {
  label: string
  big?: string | false | null
  sub?: string | false | null
  meta?: string | false | null
  empty?: boolean
  headshot?: { id: number; name: string } | false | null
  logoTeamId?: number
  logoAbbr?: string
  copyText?: string | false | null
}) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!copyText) return
    navigator.clipboard.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className={`stat-card ${empty ? 'stat-card-empty' : ''}`}>
      <div className="stat-top">
        {headshot && <Headshot playerId={headshot.id} name={headshot.name} />}
        {!headshot && logoTeamId != null && <TeamLogo teamId={logoTeamId} abbr={logoAbbr ?? ''} size={20} />}
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-big">{big || '—'}</div>
        </div>
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      {meta && <div className="stat-meta">{meta}</div>}
      {!empty && copyText && (
        <div className="stat-footer">
          <button className="stat-copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </div>
  )
}