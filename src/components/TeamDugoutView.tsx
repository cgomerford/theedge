  'use client'

  import { useState } from 'react'
  import PlayerGradeDetailModal from './PlayerGradeDetailModal'
  import Link from 'next/link'
import TeamArticles from './TeamArticles'
  import type { TeamTransaction } from '@/lib/team-transactions'
  import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
  import type { Team } from '@/lib/teams'
  import type { MLBTeamRecord, MLBNextGame, MLBTeamLeader, MLBNewsItem } from '@/lib/mlb-homepage'
  import type { TeamComposition, CompositionSlice } from '@/lib/team-composition'
  import type { TeamRankRow } from '@/lib/team-rankings'
  import type { PlayerGrade } from '@/lib/team-grades'
  import type { ScheduleRow } from '@/lib/team-schedule'
  import { pitcherHeadshotUrl } from '@/lib/team-schedule'
  import type { AffiliateStandout } from '@/lib/team-minors'
  import type { RosterPlayer, TeamMetric, RollingPoint } from '@/lib/lab'
  import SeasonRollingChart from './SeasonRollingChart'
  import StandingsChart from './StandingsChart'

  // ── NEW: lineup optimizer + bullpen usage ──
  import type { ConfirmedLineupEntry, OptimizedLineupEntry } from '@/lib/lineup-optimizer'
  import type { BullpenReport } from '@/lib/bullpen-usage'
  import type { Last7DaysWorkload } from '@/lib/pitcher-workload'
  import LineupCard from './LineupCard'
  import PitcherWorkloadCard from './PitcherWorkloadCard'
  import BullpenUsageCard from './BullpenUsageCard'
  import BattingInningChart from './BattingInningChart'
  import PitchingInningChart from './PitchingInningChart'

  type Props = {
    team: Team
    mlbId: number
    record: MLBTeamRecord | null
    nextGame: (MLBNextGame & { status?: { abstractGameState: string }; teams?: any; linescore?: any }) | null
    leaders: MLBTeamLeader[]
    news: MLBNewsItem[]
    composition: TeamComposition | null
    rankings: TeamRankRow[]
    moves: TeamTransaction[]
    ilList: TeamTransaction[]
    roster: RosterPlayer[]
    grades: Record<number, PlayerGrade>
    schedule: ScheduleRow[]
    minors: AffiliateStandout[]
    rollingSeries: Record<TeamMetric, RollingPoint[]>

    // ── NEW props ──
    confirmedLineup: ConfirmedLineupEntry[] | null
    optimizedLineupVsRHP: OptimizedLineupEntry[]
    optimizedLineupVsLHP: OptimizedLineupEntry[]
    bullpenReport: BullpenReport | null | undefined
    last7DaysWorkload: Last7DaysWorkload | null | undefined
  }

  function shortName(name: string): string {
    return name.split(' ').slice(-1)[0]
  }
  function timeAgo(iso?: string): string {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3_600_000)
    if (h < 1) return 'just now'
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }
  function subjectForPos(pos: string): 'pitcher' | 'batter' {
    return pos === 'P' ? 'pitcher' : 'batter'
  }
  function headshotUrl(personId: number): string {
    return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
  }
  function teamLogoUrl(mlbId: number): string {
    return `https://www.mlbstatic.com/team-logos/${mlbId}.svg`
  }

  const MOVE_DOT_COLORS = ['#378ADD', '#1D9E75', '#7F77DD', '#EF9F27', '#D4537E']

  function TeamLogo({ mlbId, team, size }: { mlbId: number; team: Team; size: number }) {
    const [failed, setFailed] = useState(false)
    if (failed) {
      return (
        <div style={{
          width: size, height: size, borderRadius: '50%', background: team.secondary_color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: size * 0.32, color: team.primary_color }}>
            {team.abbrev}
          </span>
        </div>
      )
    }
    return (
      <img
        src={teamLogoUrl(mlbId)}
        alt={team.name}
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    )
  }

  function PlayerHeadshot({ personId, size }: { personId: number; size: number }) {
    const [failed, setFailed] = useState(false)
    if (failed) {
      return <div style={{ width: size, height: size, borderRadius: '50%', background: '#e7e2d8', flexShrink: 0 }} />
    }
    return (
      <img
        src={headshotUrl(personId)}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#f1eee6', flexShrink: 0 }}
        onError={() => setFailed(true)}
      />
    )
  }

  function CompositionDonut({ title, subtitle, slices }: { title: string; subtitle: string; slices: CompositionSlice[] }) {
    if (slices.length === 0) {
      return (
        <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a8275', marginBottom: 4 }}>{title}</div>
          <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic', padding: '40px 0', textAlign: 'center' }}>Data unavailable right now.</p>
        </div>
      )
    }
    return (
      <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a8275', marginBottom: 4 }}>{title}</div>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, color: '#1A1A1A', marginBottom: 12 }}>{subtitle}</div>
        <div style={{ height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="90%" strokeWidth={2} stroke="#fff">
                {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip formatter={(v: unknown, n: unknown) => [typeof v === 'number' ? String(v) : '—', String(n)]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, fontSize: 10, color: '#5b5347' }}>
          {slices.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, display: 'inline-block' }} />
              {s.label} {s.count}
            </span>
          ))}
        </div>
      </div>
    )
  }

  function gradeColors(grade: string | null) {
    if (!grade) return { border: '#e7e2d8', text: '#a89e8c', bg: '#fff' }
    if (grade.startsWith('A')) return { border: '#1D9E75', text: '#085041', bg: '#E1F5EE' }
    if (grade.startsWith('B')) return { border: '#378ADD', text: '#0C447C', bg: '#E6F1FB' }
    if (grade.startsWith('C')) return { border: '#EF9F27', text: '#854F0B', bg: '#FAEEDA' }
    if (grade === 'D') return { border: '#D4537E', text: '#712B13', bg: '#FAECE7' }
    return { border: '#B23A2E', text: '#4A1B0C', bg: '#FAECE7' }
  }

  function PlayerGradeCard({ player, grade, teamAbbrev, teamColor, onOpen }: {
    player: RosterPlayer; grade: PlayerGrade | undefined; teamAbbrev: string; teamColor: string; onOpen: () => void
  }) {
    const colors = gradeColors(grade?.grade ?? null)
    return (
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          background: '#fff', border: `2px solid ${colors.border}`, borderRadius: 12, padding: '14px 10px',
          position: 'relative', cursor: 'pointer', font: 'inherit',
        }}
      >
        <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 13, fontWeight: 800, color: colors.text, background: colors.bg, borderRadius: 6, padding: '2px 7px', fontFamily: 'Fraunces, serif' }}>
          {grade?.grade ?? '—'}
        </div>
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: teamColor, padding: 2, marginBottom: 8 }}>
          <PlayerHeadshot personId={player.id} size={52} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', lineHeight: 1.2 }}>{player.fullName}</div>
        <div style={{ fontSize: 9, color: '#a89e8c', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 2 }}>{player.primaryPosition}</div>
      </button>
    )
  }

  function GradesExplainer() {
    const [open, setOpen] = useState(false)
    const rows = [
      ['A+', '95th percentile or higher'], ['A', '90th – 94th'], ['A-', '85th – 89th'],
      ['B+', '80th – 84th'], ['B', '75th – 79th'], ['B-', '70th – 74th'],
      ['C', '60th – 69th'], ['D', '50th – 59th'], ['F', 'Below 50th'],
    ]
    return (
      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#FF5722', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {open ? '− Hide' : '+ How grades work'}
        </button>
        {open && (
          <div style={{ marginTop: 10, background: '#FAF8F3', border: '1px solid #f1eee6', borderRadius: 10, padding: 14 }}>
            <p style={{ fontSize: 11, color: '#5b5347', marginBottom: 10, lineHeight: 1.5 }}>
              Each player&apos;s grade is their average percentile rank against the full league — not just qualified leaders —
              across a set of core stats: AVG/OBP/SLG/HR for batters, ERA/WHIP/K-per-9 for pitchers. A player needs at least
              10 plate appearances or 10 innings pitched to get a grade; below that, we show <strong>—</strong> rather than
              invent one from a tiny sample.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {rows.map(([g, desc]) => (
                <div key={g} style={{ fontSize: 10, color: '#1A1A1A' }}><strong>{g}</strong> — {desc}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  function ExpandableSchedule({ schedule }: { schedule: ScheduleRow[] }) {
    const [open, setOpen] = useState(false)
    const visible = open ? schedule : schedule.slice(0, 3)

    if (schedule.length === 0) {
      return (
        <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 4 }}>Upcoming schedule</div>
          <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>No scheduled games found.</p>
        </div>
      )
    }

    return (
      <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1eee6', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>
          Upcoming schedule
        </div>
        {visible.map((g, i) => (
          <div key={g.gamePk} style={{ display: 'flex', gap: 10, padding: '10px 20px', borderBottom: i === visible.length - 1 ? 'none' : '1px solid #f7f5ef', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#8a8275', width: 88, flexShrink: 0 }}>{g.date}</span>
            <span style={{ fontSize: 12, color: '#1A1A1A', width: 76, flexShrink: 0 }}>{g.isHome ? 'vs' : '@'} {g.opponentAbbrev}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {g.teamProbable ? (
                <>
                  <PlayerHeadshot personId={g.teamProbable.personId} size={22} />
                  <span style={{ fontSize: 11, color: '#5b5347' }}>{g.teamProbable.name}</span>
                  {g.teamProbableSource === 'rotation_pattern' && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#854F0B', background: '#FAEEDA', padding: '1px 5px', borderRadius: 4 }}>predicted</span>
                  )}
                </>
              ) : <span style={{ fontSize: 11, color: '#a89e8c', fontStyle: 'italic' }}>TBD</span>}
            </div>
            <span style={{ fontSize: 11, color: '#a89e8c' }}>vs</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {g.opponentProbable ? (
                <>
                  <PlayerHeadshot personId={g.opponentProbable.personId} size={22} />
                  <span style={{ fontSize: 11, color: '#5b5347' }}>{g.opponentProbable.name}</span>
                </>
              ) : <span style={{ fontSize: 11, color: '#a89e8c', fontStyle: 'italic' }}>TBD</span>}
            </div>
          </div>
        ))}
        {schedule.length > 3 && (
          <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '10px 20px', background: 'none', border: 'none', borderTop: '1px solid #f1eee6', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', cursor: 'pointer' }}>
            {open ? '− Show less' : `+ Show all ${schedule.length} games`}
          </button>
        )}
      </div>
    )
  }

  function MinorLeaderList({ title, rows, unit }: { title: string; rows: { name: string; personId: number; value: string; age?: number }[]; unit?: string }) {
    if (rows.length === 0) return null
    return (
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#8a8275', textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
        {rows.map((r, i) => (
          <div key={r.personId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 11 }}>
            <span style={{ color: '#1A1A1A' }}>{i + 1}. {r.name}{r.age ? <span style={{ color: '#a89e8c' }}> ({r.age})</span> : ''}</span>
            <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{r.value}{unit ?? ''}</span>
          </div>
        ))}
      </div>
    )
  }

  function MinorsSection({ minors }: { minors: AffiliateStandout[] }) {
    if (minors.length === 0) {
      return (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c4', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#a89e8c', marginBottom: 3 }}>Minor league affiliates</div>
          <div style={{ fontSize: 12, color: '#8a8275' }}>No affiliate data available right now.</div>
        </div>
      )
    }
    return (
      <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 4 }}>Minor league affiliates</div>
        <p style={{ fontSize: 11, color: '#a89e8c', marginBottom: 16 }}>Real season stats per affiliate </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dugout-minors-grid">
          {minors.map(m => (
            <div key={m.affiliateId} style={{ border: '1px solid #f1eee6', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <img src={m.logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A' }}>{m.level} · {m.affiliateName}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <MinorLeaderList title="Top OPS" rows={m.topOPS} />
                <MinorLeaderList title="Top HR" rows={m.topHR} />
                <MinorLeaderList title="Top ERA" rows={m.topERA} />
                <MinorLeaderList title="Top K" rows={m.topK} />
              </div>
              {m.youngPerformers.length > 0 && (
                <div style={{ borderTop: '1px solid #f1eee6', paddingTop: 10 }}>
                  <MinorLeaderList title="Players to look out for · age 23 & under" rows={m.youngPerformers} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  export default function TeamDugoutView({
    team, mlbId, record, nextGame, leaders, news, composition, rankings, moves, ilList, roster, grades, schedule, minors, rollingSeries,
    confirmedLineup, optimizedLineupVsRHP, optimizedLineupVsLHP, bullpenReport, last7DaysWorkload,
  }: Props) {
    const battingLeaders = leaders.filter(l => l.category === 'batting')
    const pitchingLeaders = leaders.filter(l => l.category === 'pitching')
    const [openPlayer, setOpenPlayer] = useState<RosterPlayer | null>(null)

    const safeBullpenReport: BullpenReport = bullpenReport ?? { relievers: [], inningUsage: [], gamesSampled: 0 }
    const safeWorkload: Last7DaysWorkload = last7DaysWorkload ?? { dates: [], pitchers: [] }

    const maxRank = 30
    function rankBarWidth(rank: number): number {
      return Math.round(((maxRank - rank + 1) / maxRank) * 100)
    }
    function ordinal(n: number): string {
      return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`
    }

    return (
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        background: '#FAF8F3',
        maxWidth: 1520,           // ← widened
        margin: '0 auto',
        padding: '28px 24px 72px', // ← a bit more breathing room
      }}>

        <div style={{ marginBottom: 16 }}>
          <Link href="/mlb" style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none' }}>← Back</Link>
        </div>

        {/* ── Hero ── */}
        <div style={{ background: team.primary_color, borderRadius: 14, padding: '28px 32px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
              <TeamLogo mlbId={mlbId} team={team} size={52} />
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: '#FDE047', marginBottom: 8 }}>Edge · {team.league} {team.division}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 34, color: team.text_on_primary }}>{team.name}</span>
                {record && (
                  <span style={{ fontSize: 13, color: team.text_on_primary, opacity: 0.75 }}>
                    {record.wins}–{record.losses} · #{record.divisionRank} {record.division} · GB {record.gb}
                  </span>
                )}
              </div>
            </div>
          </div>
          {record && (
            <div style={{ display: 'flex', gap: 28, marginTop: 16 }}>
              <div><div style={{ fontSize: 9, color: team.text_on_primary, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '.12em' }}>Streak</div><div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: team.text_on_primary, fontWeight: 600 }}>{record.streak}</div></div>
              <div><div style={{ fontSize: 9, color: team.text_on_primary, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '.12em' }}>Home</div><div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: team.text_on_primary, fontWeight: 600 }}>{record.homeRecord}</div></div>
              <div><div style={{ fontSize: 9, color: team.text_on_primary, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '.12em' }}>Away</div><div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: team.text_on_primary, fontWeight: 600 }}>{record.awayRecord}</div></div>
            </div>
          )}
        </div>

        {/* ── Main two-column layout (widened) ── */}
        <div
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 24 }}
          className="dugout-main-layout"
        >
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

            <ExpandableSchedule schedule={schedule} />

            <LineupCard
              teamColor={team.primary_color}
              confirmed={confirmedLineup ?? null}
              optimizedVsRHP={optimizedLineupVsRHP ?? []}
              optimizedVsLHP={optimizedLineupVsLHP ?? []}
            />

            <PitcherWorkloadCard workload={safeWorkload} teamColor={team.primary_color} />

            {/* Composition – 2-col */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dugout-composition-grid">
              <CompositionDonut title="Age distribution" subtitle={composition ? `${composition.rosterSize} on the 40-man` : ''} slices={composition?.ageGroups ?? []} />
              <CompositionDonut title="Nationality mix" subtitle={composition ? `${composition.rosterSize} on the 40-man` : ''} slices={composition?.nationality ?? []} />
            </div>

            {/* Moves + IL – 2-col */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16 }} className="dugout-moves-grid">
              <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1eee6', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Latest roster moves</div>
                {moves.length === 0 ? (
                  <p style={{ padding: '20px', fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>No recent moves.</p>
                ) : moves.slice(0, 6).map((tx, i) => (
                  <div key={tx.transaction_id} style={{ display: 'flex', gap: 10, padding: '11px 20px', borderBottom: i === Math.min(moves.length, 6) - 1 ? 'none' : '1px solid #f7f5ef', alignItems: 'center' }}>
                    <PlayerHeadshot personId={tx.player_id} size={24} />
                    {tx.is_milb_move && tx.to_affiliate_level && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#0C447C', background: '#E6F1FB', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
                        {tx.to_affiliate_level}
                      </span>
                    )}
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: MOVE_DOT_COLORS[i % MOVE_DOT_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: '#8a8275', width: 68, flexShrink: 0 }}>
                      {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 12, color: '#1A1A1A' }}>{tx.player_name} — {tx.category}{tx.to_team_name ? ` to ${tx.to_team_name}` : ''}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1eee6', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Injured list</div>
                {ilList.length === 0 ? (
                  <p style={{ padding: '20px', fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>No active IL placements.</p>
                ) : ilList.slice(0, 6).map((tx, i) => (
                  <div key={tx.transaction_id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '11px 20px', borderBottom: i === Math.min(ilList.length, 6) - 1 ? 'none' : '1px solid #f7f5ef' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <PlayerHeadshot personId={tx.player_id} size={24} />
                      <span style={{ fontSize: 12, color: '#1A1A1A' }}>{tx.player_name}</span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#412402', background: '#FAEEDA', padding: '2px 6px', borderRadius: 5 }}>{tx.il_days ? `IL-${tx.il_days}` : 'IL'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rankings */}
            <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Team rankings vs league</div>
                <span style={{ fontSize: 9, color: '#a89e8c' }}>30 = worst · 1 = best</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }} className="dugout-rankings-grid">
                {rankings.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>Rankings unavailable right now.</p>
                ) : rankings.map(r => (
                  <div key={r.metric}>
                    <div style={{ fontSize: 9, color: '#8a8275', textTransform: 'uppercase', marginBottom: 6 }}>{r.label}</div>
                    <div style={{ height: 5, background: '#f1eee6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${rankBarWidth(r.rank)}%`, height: '100%', background: '#F0997B' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#1A1A1A', marginTop: 4, fontWeight: 500 }}>{ordinal(r.rank)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roster grades */}
            <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 4 }}>Roster grades</div>
              <p style={{ fontSize: 11, color: '#a89e8c', marginBottom: 10 }}>Average percentile across core stats, min 10 PA/IP · league-wide pool · tap a player for the full breakdown</p>
              <GradesExplainer />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                {roster.map(p => (
                  <PlayerGradeCard
                    key={p.id}
                    player={p}
                    grade={grades[p.id]}
                    teamAbbrev={team.abbrev}
                    teamColor={team.primary_color}
                    onOpen={() => setOpenPlayer(p)}
                  />
                ))}
              </div>
            </div>

            <MinorsSection minors={minors} />

            {/* Bullpen block */}
            <BullpenUsageCard
              relievers={safeBullpenReport.relievers}
              teamColor={team.primary_color}
              gamesSampled={safeBullpenReport.gamesSampled}
            />
            <BattingInningChart
              data={safeBullpenReport.inningUsage}
              teamColor={team.primary_color}
              gamesSampled={safeBullpenReport.gamesSampled}
            />
            <PitchingInningChart
              data={safeBullpenReport.inningUsage}
              teamColor={team.primary_color}
              gamesSampled={safeBullpenReport.gamesSampled}
            />

            {/* Leaders + Next game – 2-col */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dugout-leaders-grid">
              <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 12 }}>Team leaders</div>
                {[...battingLeaders.slice(0, 2), ...pitchingLeaders.slice(0, 2)].map(l => (
                  <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f7f5ef' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A' }}>{shortName(l.name)}</div>
                      <div style={{ fontSize: 9, color: '#a89e8c', textTransform: 'uppercase' }}>{l.label}</div>
                    </div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 17, fontWeight: 700, color: team.primary_color }}>{l.value}</div>
                  </div>
                ))}
                <Link href={`/mlb/teams/${team.slug}/stats`} style={{ display: 'block', marginTop: 12, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none' }}>Full roster & stats →</Link>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 12 }}>
                  {nextGame?.status?.abstractGameState === 'Live' ? 'Live game' : 'Next game'}
                </div>
                {nextGame ? (
                  <div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: '#1A1A1A', marginBottom: 4 }}>{nextGame.isHome ? 'vs' : '@'} {shortName(nextGame.opponent)}</div>
                    <div style={{ fontSize: 11, color: '#a89e8c', marginBottom: 12 }}>{nextGame.venue}</div>
                    <Link href={`/mlb/${nextGame.slug}`} style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none' }}>View full preview →</Link>
                  </div>
                ) : <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic' }}>No upcoming games found.</p>}
              </div>
            </div>

            {/* News */}
            {news.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1eee6', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Latest {team.short} news</div>
                {news.slice(0, 5).map((item, i) => (
                  <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: i === 4 ? 'none' : '1px solid #f7f5ef', textDecoration: 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 13, color: '#1A1A1A', marginBottom: 4 }}>{item.headline}</div>
                      <div style={{ fontSize: 9, color: '#a89e8c', textTransform: 'uppercase' }}>{timeAgo(item.published)}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

 {/* RIGHT STICKY SIDEBAR */}
          <div style={{ position: 'sticky', top: 16, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 4 }}>Season rolling trend</div>
              <SeasonRollingChart series={rollingSeries} teamColor={team.primary_color} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 10 }}>Standings</div>
              <StandingsChart defaultDivision={`${team.league} ${team.division}`} />
            </div>
            <TeamArticles teamCode={team.abbrev} />
          </div>
        </div>

        {openPlayer && (
          <PlayerGradeDetailModal
            player={openPlayer}
            grade={grades[openPlayer.id]}
            teamColor={team.primary_color}
            onClose={() => setOpenPlayer(null)}
          />
        )}

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 1100px) {
            .dugout-main-layout { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 700px) {
            .dugout-composition-grid,
            .dugout-moves-grid,
            .dugout-leaders-grid,
            .dugout-minors-grid { grid-template-columns: 1fr !important; }
            .dugout-rankings-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}} />
      </div>
    )
  }