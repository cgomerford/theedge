// src/app/fantasy/start-sit/StartSitBoard.tsx
//
// REDESIGNED — self-contained. No dependency on FantasyPickRow or
// FantasySectionLabel. Every sub-component lives in this file so the
// page is a single drop-in replacement.
//
// Layout: summary strip → Start (pitchers / hitters, tiered) → Waiver Wire
// Each card: headshot · name/team · matchup · signal meter · ownership · one-liner

import Link from 'next/link'
import type { FantasyPick } from '@/lib/fantasy'

// ─── Player link builder ──────────────────────────────────────────────────────
// Links to /mlb/players/[id]?tab=fantasy so the player page opens directly
// on the Fantasy tab (regression charts, expected-vs-actual, splits, trends).
// Falls back to null when there's no player_id (e.g. TBD pitcher).

function playerHref(playerId: number | null): string | null {
  if (!playerId) return null
  return `/mlb/players/${playerId}?tab=fantasy`
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  streamers: FantasyPick[]
  sleepers: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
  forDate: string
  isStale: boolean
  isPro: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = {
  cream: '#FAF8F3',
  orange: '#FF5722',
  yellow: '#FDE047',
  black: '#1A1A1A',
  ink: '#1A1A1A',
  muted: '#78716c',
  axis: '#A8A29E',
  grid: '#E7E5E4',
  green: '#059669',
  greenLight: '#D1FAE5',
  greenBg: '#ECFDF5',
  amber: '#D97706',
  amberLight: '#FEF3C7',
  amberBg: '#FFFBEB',
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

function headshotUrl(playerId: number | null): string | null {
  if (!playerId) return null
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_80,q_auto:best/v1/people/${playerId}/headshot/67/current`
}

function tierFromScore(score: number | null): 'strong' | 'viable' | 'fringe' {
  if (score == null) return 'fringe'
  if (score >= 70) return 'strong'
  if (score >= 45) return 'viable'
  return 'fringe'
}

function isPitcher(pick: FantasyPick): boolean {
  const pt = pick.details?.player_type
  if (pt === 'pitcher') return true
  // Streamer picks are always pitchers
  if (pick.pick_type === 'streamer') return true
  return false
}

function gameTimeShort(gameTime: string | null): string {
  if (!gameTime) return ''
  try {
    const d = new Date(gameTime)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}

// ─── Signal Meter ─────────────────────────────────────────────────────────────

function SignalMeter({ score, tier }: { score: number | null; tier: 'strong' | 'viable' | 'fringe' }) {
  const pct = Math.max(5, Math.min(100, score ?? 0))
  const fill =
    tier === 'strong' ? COLORS.green :
    tier === 'viable' ? COLORS.amber :
    COLORS.axis

  const styles = `
    .signal-track { position: relative; height: 6px; background: ${COLORS.grid}; overflow: hidden; }
    .signal-fill { position: absolute; left: 0; top: 0; height: 100%; transition: width 0.4s ease; }
  `

  return (
    <div style={{ width: '100%' }}>
      <style>{styles}</style>
      <div className="signal-track">
        <div className="signal-fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  )
}

// ─── Ownership Badge ──────────────────────────────────────────────────────────

function OwnershipBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null

  const isUnderOwned = pct < 15
  const display = `${Math.round(pct)}%`

  if (isUnderOwned) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
          color: COLORS.purple, background: COLORS.purpleBg,
          padding: '2px 8px',
        }}
      >
        {display} owned
      </span>
    )
  }

  return (
    <span
      style={{
        fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        fontSize: 10, color: COLORS.axis, letterSpacing: '0.04em',
      }}
    >
      {display} owned
    </span>
  )
}

// ─── Tier Badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: 'strong' | 'viable' | 'fringe' }) {
  const config = {
    strong: { label: 'STRONG', bg: COLORS.greenLight, color: COLORS.green },
    viable: { label: 'VIABLE', bg: COLORS.amberLight, color: COLORS.amber },
    fringe: { label: 'FRINGE', bg: COLORS.grid, color: COLORS.muted },
  }
  const c = config[tier]

  return (
    <span
      style={{
        fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
        color: c.color, background: c.bg,
        padding: '2px 6px',
      }}
    >
      {c.label}
    </span>
  )
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({ pick, ownership }: { pick: FantasyPick; ownership: number | null }) {
  const score = pick.signal_score
  const tier = tierFromScore(score)
  const headshot = headshotUrl(pick.player_id)
  const time = gameTimeShort(pick.game_time)
  const opponent = pick.opponent_name
  const pHref = playerHref(pick.player_id)

  const cardStyles = `
    .pick-card { border: 1px solid ${COLORS.grid}; background: #fff; transition: border-color 0.15s; }
    .pick-card:hover { border-color: ${COLORS.axis}; }
  `

  const HeadshotEl = headshot ? (
    <img
      src={headshot}
      alt={pick.player_name}
      width={44}
      height={44}
      style={{
        width: 44, height: 44, objectFit: 'cover',
        background: COLORS.grid, flexShrink: 0,
        border: `1px solid ${COLORS.grid}`,
      }}
    />
  ) : (
    <div style={{
      width: 44, height: 44, background: COLORS.grid, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 700, color: COLORS.axis,
      border: `1px solid ${COLORS.grid}`,
    }}>
      ?
    </div>
  )

  const NameEl = (
    <span style={{
      fontFamily: 'Fraunces, ui-serif, Georgia, serif',
      fontSize: 16, fontWeight: 700, color: COLORS.ink,
    }}>
      {pick.player_name}
    </span>
  )

  // Headshot + name wrapped in a single Link when we have a player ID.
  // The Link uses display:flex so it participates in the parent flex row
  // while containing both the headshot and the name/tier line.
  const PlayerIdentity = pHref ? (
    <Link
      href={pHref}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit',
      }}
    >
      {HeadshotEl}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {NameEl}
          <TierBadge tier={tier} />
        </div>
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 10.5, color: COLORS.muted, marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          {pick.team_name && <span>{pick.team_name}</span>}
          {opponent && (
            <span style={{ color: COLORS.axis }}>
              vs {opponent}{time ? ` · ${time}` : ''}
            </span>
          )}
        </div>
      </div>
    </Link>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      {HeadshotEl}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {NameEl}
          <TierBadge tier={tier} />
        </div>
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 10.5, color: COLORS.muted, marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          {pick.team_name && <span>{pick.team_name}</span>}
          {opponent && (
            <span style={{ color: COLORS.axis }}>
              vs {opponent}{time ? ` · ${time}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <style>{cardStyles}</style>
      <div className="pick-card" style={{ padding: 0 }}>

        {/* ── Top row: identity + score ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 0 16px' }}>
          {PlayerIdentity}

          {/* Score */}
          {score != null && (
            <div style={{
              fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              fontSize: 22, fontWeight: 800, color: tier === 'strong' ? COLORS.green : tier === 'viable' ? COLORS.amber : COLORS.muted,
              flexShrink: 0, lineHeight: 1,
            }}>
              {score}
            </div>
          )}
        </div>

        {/* ── Signal bar ── */}
        <div style={{ padding: '10px 16px 0 16px' }}>
          <SignalMeter score={score} tier={tier} />
        </div>

        {/* ── One-liner + metadata row ── */}
        <div style={{ padding: '10px 16px 14px 16px' }}>
          <p style={{
            fontFamily: 'Fraunces, ui-serif, Georgia, serif',
            fontSize: 13, fontStyle: 'italic', color: COLORS.muted,
            lineHeight: 1.45, margin: 0,
          }}>
            {pick.one_liner}
          </p>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 10, flexWrap: 'wrap', gap: 6,
          }}>
            <OwnershipBadge pct={ownership} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {pick.game_slug && (
                <Link
                  href={`/mlb/${pick.game_slug}`}
                  style={{
                    fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                    fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: COLORS.axis, textDecoration: 'none',
                  }}
                >
                  Game →
                </Link>
              )}
              {pHref && (
                <Link
                  href={pHref}
                  style={{
                    fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                    fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: COLORS.orange, textDecoration: 'none',
                  }}
                >
                  Player profile →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptySlot({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{
      border: `1px dashed ${COLORS.grid}`,
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
        color: accent, marginBottom: 6, fontWeight: 700,
      }}>
        ⊕ Pending
      </div>
      <p style={{
        fontFamily: 'Fraunces, ui-serif, Georgia, serif',
        fontSize: 13.5, fontStyle: 'italic', color: COLORS.axis,
        margin: 0, lineHeight: 1.45,
      }}>
        {label}
      </p>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHead({ icon, title, subtitle, accent }: {
  icon: string; title: string; subtitle: string; accent: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase',
        color: accent, marginBottom: 4,
      }}>
        {icon} {title}
      </div>
      <p style={{
        fontFamily: 'Fraunces, ui-serif, Georgia, serif',
        fontSize: 14, fontStyle: 'italic', color: COLORS.muted,
        margin: 0, lineHeight: 1.5, maxWidth: 560,
      }}>
        {subtitle}
      </p>
    </div>
  )
}

// ─── Summary Strip ────────────────────────────────────────────────────────────

function SummaryStrip({ streamers, sleepers, ownershipByPickId }: {
  streamers: FantasyPick[]; sleepers: FantasyPick[]; ownershipByPickId: Record<number, number | null>
}) {
  const startCount = streamers.length
  const wireCount = sleepers.length
  const strongCount = streamers.filter(p => tierFromScore(p.signal_score) === 'strong').length
  const underOwnedCount = sleepers.filter(p => {
    const own = ownershipByPickId[p.id]
    return own != null && own < 15
  }).length

  const chipStyle = {
    fontFamily: 'ui-monospace, "JetBrains Mono", monospace' as const,
    fontSize: 11, fontWeight: 700 as const, letterSpacing: '0.05em',
    padding: '5px 12px',
    border: `1px solid ${COLORS.grid}`,
    background: '#fff',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '14px 0', borderBottom: `1px solid ${COLORS.grid}`, marginBottom: 32,
    }}>
      <span style={{ ...chipStyle, color: COLORS.green }}>
        {startCount} start{startCount !== 1 ? 's' : ''}
      </span>
      {strongCount > 0 && (
        <span style={{ ...chipStyle, color: COLORS.green, background: COLORS.greenBg }}>
          {strongCount} strong
        </span>
      )}
      <span style={{ ...chipStyle, color: COLORS.amber }}>
        {wireCount} wire target{wireCount !== 1 ? 's' : ''}
      </span>
      {underOwnedCount > 0 && (
        <span style={{ ...chipStyle, color: COLORS.purple, background: COLORS.purpleBg }}>
          {underOwnedCount} under-owned
        </span>
      )}
    </div>
  )
}

// ─── Tiered list ──────────────────────────────────────────────────────────────

function TieredPickList({ picks, ownershipByPickId, emptyLabel, emptyAccent }: {
  picks: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
  emptyLabel: string
  emptyAccent: string
}) {
  if (picks.length === 0) {
    return <EmptySlot label={emptyLabel} accent={emptyAccent} />
  }

  const strong = picks.filter(p => tierFromScore(p.signal_score) === 'strong')
  const viable = picks.filter(p => tierFromScore(p.signal_score) === 'viable')
  const fringe = picks.filter(p => tierFromScore(p.signal_score) === 'fringe')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {strong.map(p => <PlayerCard key={p.id} pick={p} ownership={ownershipByPickId[p.id] ?? null} />)}
      {strong.length > 0 && viable.length > 0 && (
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: COLORS.axis, padding: '6px 0',
          borderTop: `1px solid ${COLORS.grid}`,
        }}>
          Also viable
        </div>
      )}
      {viable.map(p => <PlayerCard key={p.id} pick={p} ownership={ownershipByPickId[p.id] ?? null} />)}
      {fringe.length > 0 && (strong.length > 0 || viable.length > 0) && (
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: COLORS.axis, padding: '6px 0',
          borderTop: `1px solid ${COLORS.grid}`,
        }}>
          Deeper options
        </div>
      )}
      {fringe.map(p => <PlayerCard key={p.id} pick={p} ownership={ownershipByPickId[p.id] ?? null} />)}
    </div>
  )
}

// ─── Start Section (split pitchers / hitters) ─────────────────────────────────

function StartSection({ picks, ownershipByPickId }: {
  picks: FantasyPick[]
  ownershipByPickId: Record<number, number | null>
}) {
  const pitchers = picks.filter(isPitcher)
  const hitters = picks.filter(p => !isPitcher(p))

  const styles = `
    .start-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
    }
    @media (min-width: 768px) {
      .start-grid {
        grid-template-columns: 1fr 1fr;
        gap: 28px;
      }
    }
  `

  // If all picks are pitchers (common for streamers), use full width
  if (hitters.length === 0) {
    return (
      <div>
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: COLORS.axis, marginBottom: 12, fontWeight: 600,
        }}>
          § Pitchers · ranked by signal strength
        </div>
        <TieredPickList
          picks={pitchers}
          ownershipByPickId={ownershipByPickId}
          emptyLabel="Streamer picks populate 3–4 hours before first pitch."
          emptyAccent={COLORS.green}
        />
      </div>
    )
  }

  return (
    <div>
      <style>{styles}</style>
      <div className="start-grid">
        <div>
          <div style={{
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
            fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: COLORS.axis, marginBottom: 12, fontWeight: 600,
          }}>
            § Arms
          </div>
          <TieredPickList
            picks={pitchers}
            ownershipByPickId={ownershipByPickId}
            emptyLabel="No pitchers clearing the start threshold today."
            emptyAccent={COLORS.green}
          />
        </div>
        <div>
          <div style={{
            fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
            fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: COLORS.axis, marginBottom: 12, fontWeight: 600,
          }}>
            § Bats
          </div>
          <TieredPickList
            picks={hitters}
            ownershipByPickId={ownershipByPickId}
            emptyLabel="No hitters clearing the start threshold today."
            emptyAccent={COLORS.green}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export default function StartSitBoard({
  streamers, sleepers, ownershipByPickId, forDate, isStale, isPro,
}: Props) {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 16px 64px' }}>

      {/* ── Masthead ── */}
      <div style={{ paddingTop: 28, paddingBottom: 20, borderBottom: `2px solid ${COLORS.ink}`, marginBottom: 0 }}>
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: COLORS.orange, fontWeight: 700, marginBottom: 6,
        }}>
          ⊕ The Edge · Fantasy Desk · {isPro ? 'Pro' : 'Free'}
        </div>
        <h1 style={{
          fontFamily: 'Fraunces, ui-serif, Georgia, serif',
          fontSize: 'clamp(28px, 5vw, 40px)',
          fontWeight: 700, letterSpacing: '-0.02em',
          lineHeight: 1.05, margin: 0,
          color: COLORS.ink,
        }}>
          Start / Sit &amp; Waiver Wire<span style={{ color: COLORS.orange }}>.</span>
        </h1>
        <div style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 10.5, color: COLORS.axis, marginTop: 10,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span>{formatDate(forDate)}</span>
          {isStale && (
            <span style={{
              color: COLORS.amber, background: COLORS.amberLight, padding: '2px 8px',
              fontWeight: 600,
            }}>
              Yesterday — today updates ~23:30 UTC
            </span>
          )}
        </div>
      </div>

      {/* ── Summary strip ── */}
      <SummaryStrip streamers={streamers} sleepers={sleepers} ownershipByPickId={ownershipByPickId} />

      {/* ── START ── */}
      <section style={{ marginBottom: 48 }}>
        <SectionHead
          icon="§"
          title="Start today"
          subtitle="Favorable matchups worth starting tonight — park factors, opposing pitcher weaknesses, and recent form drive these."
          accent={COLORS.green}
        />
        <StartSection picks={streamers} ownershipByPickId={ownershipByPickId} />
      </section>

      {/* ── WAIVER WIRE ── */}
      <section style={{ marginBottom: 48 }}>
        <SectionHead
          icon="⊕"
          title="Waiver wire"
          subtitle="Signal-based, not hype-based — these clear the model's threshold on underlying skill metrics regardless of roster percentage."
          accent={COLORS.amber}
        />
        <TieredPickList
          picks={sleepers}
          ownershipByPickId={ownershipByPickId}
          emptyLabel="No hidden gems clearing the signal floor today."
          emptyAccent={COLORS.amber}
        />
      </section>

      {/* ── Footer ── */}
      <div style={{ paddingTop: 20, borderTop: `1px solid ${COLORS.grid}` }}>
        <p style={{
          fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
          fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: COLORS.axis,
        }}>
          Information only · Not gambling advice · Signal scores 0–100
        </p>
      </div>
    </div>
  )
}