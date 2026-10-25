// src/components/nhl/Preview.tsx
//
// The NHL game preview page. Same page shape as the MLB/NFL team pages
// (team/ui.tsx Section/Card/Tile/ProPanel, numbered sections, sticky nav,
// honest-n footnotes) per DESIGN_SYSTEM.md -- built fresh for NHL rather than
// importing MLB or NFL components (CLAUDE.md N1/N2 lock: don't copy or edit
// another sport's files). No logos, no headshots -- TeamChip/PlayerChip from
// chips.tsx only. No NHL fetch happens here; `preview` is pre-built server-side
// by getNhlPreview() from cached Supabase rows.

import { C, SANS, MONO, Section, Card, Tile, Empty, Foot } from '@/components/team/ui'
import { TeamChip, PlayerChip } from '@/components/team/chips'
import { UsageStrip } from '@/components/team/UsageStrip'
import ProPanel from '@/components/profile/ProPanel'
import { NHL_CSS } from './nhl-css'
import type { NhlPreview } from '@/lib/nhl/preview'

const NAV: [string, string][] = [
  ['overview', 'Overview'],
  ['deployment', 'Deployment'],
  ['availability', 'Availability'],
  ['goalies', 'Goalies'],
  ['series', 'Series'],
]

function pct(v: number | null, decimals = 0): string {
  return v == null ? '—' : `${(v * 100).toFixed(decimals)}%`
}

function fmt1(v: number | null): string {
  return v == null ? '—' : v.toFixed(1)
}

function restLabel(days: number | null): string | null {
  if (days == null) return null
  if (days === 0) return 'Back-to-back'
  if (days === 1) return '1 day rest'
  return `${days} days rest`
}

/** Two-sided bar: away grows left, home grows right -- no logos, just colour. */
function TwoSidedBar({
  label, awayValue, homeValue, awayDisplay, homeDisplay, awayColor, homeColor,
}: {
  label: string; awayValue: number | null; homeValue: number | null
  awayDisplay: string; homeDisplay: string; awayColor: string; homeColor: string
}) {
  const max = Math.max(Math.abs(awayValue ?? 0), Math.abs(homeValue ?? 0), 1e-9)
  const aw = awayValue == null ? 0 : (Math.abs(awayValue) / max) * 100
  const hw = homeValue == null ? 0 : (Math.abs(homeValue) / max) * 100
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 120px minmax(0,1fr) 64px', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 700, textAlign: 'right', color: C.ink }}>{awayDisplay}</span>
      <div style={{ height: 8, background: C.soft, borderRadius: 4, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: `${aw}%`, background: awayColor, borderRadius: 4 }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', color: C.mute, textAlign: 'center' }}>{label}</span>
      <div style={{ height: 8, background: C.soft, borderRadius: 4 }}>
        <div style={{ width: `${hw}%`, background: homeColor, borderRadius: 4 }} />
      </div>
      <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12.5, fontWeight: 700, color: C.ink }}>{homeDisplay}</span>
    </div>
  )
}

export default function Preview({ preview, isPro }: { preview: NhlPreview; isPro: boolean }) {
  const { game, away, home, awayForm, homeForm, awayGoalies, homeGoalies, seasonSeries, awayDeployment, homeDeployment, awayAvailability, homeAvailability } = preview

  const awayColor = away.color || C.ink
  const homeColor = home.color || C.ink
  const awayOn = away.textColor || '#fff'
  const homeOn = home.textColor || '#fff'

  const startLocal = game.startTimeUtc
    ? new Date(game.startTimeUtc).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/London' })
    : null
  const startVenue = game.startTimeUtc && game.venueTz
    ? new Date(game.startTimeUtc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: game.venueTz })
    : null

  const record = (f: typeof awayForm) => `${f.wins}-${f.losses}-${f.otLosses}`

  return (
    <div className="tp-root" style={{ background: C.cream, fontFamily: SANS, minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: NHL_CSS }} />
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 24px 80px' }}>
        {/* Hero: two-tone diagonal, away colour left / home colour right -- no logos */}
        <div style={{ borderRadius: 18, overflow: 'hidden', position: 'relative', background: `linear-gradient(100deg, ${awayColor} 0%, ${awayColor} 46%, ${homeColor} 54%, ${homeColor} 100%)` }}>
          <div style={{ padding: '22px 26px 20px' }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.35)', marginBottom: 14 }}>
              ⊕ NHL Preview (private prototype) · {game.gameDate}
            </div>
            <div className="nhl-hero-grid">
              <div style={{ textAlign: 'left' }}>
                <TeamChip team={{ id: away.id, abbrev: away.abbrev, color: 'rgba(255,255,255,.2)', textColor: awayOn }} />
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(24px,4vw,40px)', color: awayOn, letterSpacing: '-.02em', marginTop: 8 }}>{away.fullName}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: awayOn, opacity: 0.85, marginTop: 4 }}>{record(awayForm)} last {awayForm.gamesPlayed}</div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '.2em', background: 'rgba(26,26,26,.78)', color: '#FAF8F3', padding: '6px 12px', borderRadius: 4 }}>@</div>
              <div style={{ textAlign: 'right' }}>
                <TeamChip team={{ id: home.id, abbrev: home.abbrev, color: 'rgba(255,255,255,.2)', textColor: homeOn }} />
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 'clamp(24px,4vw,40px)', color: homeOn, letterSpacing: '-.02em', marginTop: 8 }}>{home.fullName}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: homeOn, opacity: 0.85, marginTop: 4 }}>{record(homeForm)} last {homeForm.gamesPlayed}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 18, justifyContent: 'center' }}>
              {game.venue && <Chip>{game.venue}</Chip>}
              {startVenue && <Chip>{startVenue} local{startLocal ? ` · ${startLocal} UK` : ''}</Chip>}
              {restLabel(preview.awayRestDays) && <Chip>{away.abbrev}: {restLabel(preview.awayRestDays)}</Chip>}
              {restLabel(preview.homeRestDays) && <Chip>{home.abbrev}: {restLabel(preview.homeRestDays)}</Chip>}
            </div>
          </div>
        </div>

        <nav className="nhl-nav" aria-label="Preview sections" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(250,248,243,.95)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${C.line}`, margin: '16px -24px 0', padding: '10px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        {/* §01 Overview -- FREE */}
        <Section id="overview" num="01" title="Overview" sub="Record, scoring and special teams over each club's last games. All figures are computed by x9Lab from NHL play-by-play, not an NHL or third-party stat.">
          <Card>
            <div className="nhl-grid-2" style={{ marginBottom: 16 }}>
              <div className="nhl-tiles">
                <Tile label={`${away.abbrev} GF/game`} value={fmt1(awayForm.gfPerGame)} sub={`last ${awayForm.gamesPlayed}`} />
                <Tile label={`${away.abbrev} GA/game`} value={fmt1(awayForm.gaPerGame)} sub={`last ${awayForm.gamesPlayed}`} />
                <Tile label={`${home.abbrev} GF/game`} value={fmt1(homeForm.gfPerGame)} sub={`last ${homeForm.gamesPlayed}`} />
                <Tile label={`${home.abbrev} GA/game`} value={fmt1(homeForm.gaPerGame)} sub={`last ${homeForm.gamesPlayed}`} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TwoSidedBar label="PP%" awayValue={awayForm.ppPct} homeValue={homeForm.ppPct} awayDisplay={pct(awayForm.ppPct)} homeDisplay={pct(homeForm.ppPct)} awayColor={awayColor} homeColor={homeColor} />
              <TwoSidedBar label="PK%" awayValue={awayForm.pkPct} homeValue={homeForm.pkPct} awayDisplay={pct(awayForm.pkPct)} homeDisplay={pct(homeForm.pkPct)} awayColor={awayColor} homeColor={homeColor} />
              <TwoSidedBar label="5v5 shot-attempt share" awayValue={awayForm.shotAttemptShare5v5} homeValue={homeForm.shotAttemptShare5v5 != null ? 1 - homeForm.shotAttemptShare5v5 : null} awayDisplay={pct(awayForm.shotAttemptShare5v5)} homeDisplay={pct(homeForm.shotAttemptShare5v5)} awayColor={awayColor} homeColor={homeColor} />
            </div>
          </Card>
          <Foot>PP%/PK%/5v5 shot-attempt share are computed by x9Lab from play-by-play and the strength timeline, over each club&apos;s last {Math.max(awayForm.gamesPlayed, homeForm.gamesPlayed)} games -- not an NHL-published figure.</Foot>
        </Section>

        {/* §02 Deployment -- FREE 5v5, PRO the rest */}
        <Section id="deployment" num="02" title="Deployment" sub="Ice time by strength, last 5 games. Rank is never shown here -- just the figure and its sample size.">
          <div className="nhl-grid-2">
            <UsageStrip team={{ id: away.id, nick: away.abbrev, color: away.color || C.ink }} metric="nhl_toi_5v5" data={awayDeployment} />
            <UsageStrip team={{ id: home.id, nick: home.abbrev, color: home.color || C.ink }} metric="nhl_toi_5v5" data={homeDeployment} />
          </div>
          <div style={{ marginTop: 16 }}>
            <ProPanel
              title="Full deployment"
              blurb="Penalty-kill ice time, shifts per game, average shift length and the full roster for both teams, season vs last-5 deltas."
              features={['Penalty-kill ice time (PK1/PK2 usage)', 'Shifts per game and average shift length', 'Full roster, not just the top 8', 'Season vs last-5 deltas']}
              isPro={isPro}
            />
          </div>
        </Section>

        {/* §03 Availability -- FREE */}
        <Section id="availability" num="03" title="Availability" sub="Derived from NHL game lineups and roster changes. x9Lab has no injury feed for NHL.">
          <div className="nhl-grid-2">
            <Card title={away.abbrev}>
              {awayAvailability.length === 0 ? <Empty>No availability data yet.</Empty> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {awayAvailability.slice(0, 10).map((a) => (
                    <div key={a.playerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <PlayerChip player={{ id: a.playerId, name: a.name, position: a.position }} />
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, textAlign: 'right' }}>{a.copy}{a.roosterChangeCopy ? ` · ${a.roosterChangeCopy}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={home.abbrev}>
              {homeAvailability.length === 0 ? <Empty>No availability data yet.</Empty> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {homeAvailability.slice(0, 10).map((a) => (
                    <div key={a.playerId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <PlayerChip player={{ id: a.playerId, name: a.name, position: a.position }} />
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, textAlign: 'right' }}>{a.copy}{a.roosterChangeCopy ? ` · ${a.roosterChangeCopy}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </Section>

        {/* §04 Goalies -- FREE last starter + rest, PRO full table */}
        <Section id="goalies" num="04" title="Goalies" sub="Recent starts, not projected. No confirmed-starter feed.">
          <div className="nhl-grid-2">
            {[[away, awayGoalies], [home, homeGoalies]].map(([team, goalies]) => {
              const t = team as typeof away
              const list = goalies as typeof awayGoalies
              const last = list[0]
              return (
                <Card key={t.id} title={t.abbrev}>
                  {!last ? <Empty>No recent starts.</Empty> : (
                    <div>
                      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: C.ink }}>{last.name}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 4 }}>
                        {restLabel(last.restDays) ?? 'Rest unknown'} · season EV save% {pct(last.seasonEvSavePct, 1)}
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <ProPanel
              title="Goalie workload"
              blurb="Full starts table (last 3, rest days, back-to-backs) for every goalie on both rosters."
              features={['Last 3 starts per goalie', 'Rest days and back-to-back flags', 'Season EV save% for every goalie, not just the starter']}
              isPro={isPro}
            />
          </div>
        </Section>

        {/* §05 Season series -- FREE, our own results only */}
        <Section id="series" num="05" title="Season series" sub="Our own game results only.">
          <Card>
            {seasonSeries.length === 0 ? (
              <Empty>No meetings between these two clubs yet this season.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {seasonSeries.map((g) => (
                  <div key={g.gameId} style={{ fontFamily: MONO, fontSize: 12, color: C.ink, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{g.gameDate}</span>
                    <span>{away.abbrev} {g.awayScore ?? '—'} - {g.homeScore ?? '—'} {home.abbrev}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Foot>Results from x9Lab&apos;s own nhl_games table.</Foot>
        </Section>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: 'rgba(255,255,255,.94)', borderRadius: 4, padding: '3px 9px', fontFamily: MONO, fontSize: 9.5, color: '#3a352c', textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {children}
    </span>
  )
}
