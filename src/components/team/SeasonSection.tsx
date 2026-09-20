// src/components/team/SeasonSection.tsx
//
// § 01 "Where they are in the season": the game-by-game story (interactive
// timeline), month-by-month, record splits, the division / wild-card
// picture, and what is left on the schedule. All from real results
// (lib/team-profile/season.ts + league.ts) — a descriptive record of what
// happened, never a projection.

import type { Team } from '@/lib/teams'
import type { TeamProfile, DivisionRow } from '@/lib/team-profile'
import { Card, Empty, Foot, Section, Tile, C, MONO, SANS } from './ui'
import { SeasonTimelineChart } from './charts'
import { SeasonPro } from './ProModules'

const f3 = (v: number) => v.toFixed(3).replace(/^0/, '')

function MonthBars({ p, color }: { p: TeamProfile; color: string }) {
  const months = p.story?.monthly ?? []
  if (months.length === 0) return <Empty>No games played yet.</Empty>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, gap: 8, alignItems: 'end' }}>
      {months.map(m => {
        const pct = m.w + m.l > 0 ? m.w / (m.w + m.l) : 0
        return (
          <div key={m.key} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, fontWeight: 700, color: pct >= 0.5 ? C.good : C.bad }}>{f3(pct)}</div>
            <div style={{ height: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', margin: '4px 0' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: '50%', borderTop: '1px dashed #cfc8b8' }} />
              <div style={{ width: '62%', height: `${Math.max(pct * 100, 4)}%`, background: pct >= 0.5 ? color : '#cfc8b8', borderRadius: '5px 5px 0 0' }} />
            </div>
            <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, color: C.ink, fontWeight: 700 }}>{m.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: C.mute }}>{m.w}–{m.l}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: m.diff >= 0 ? C.good : C.bad }}>{m.diff > 0 ? '+' : ''}{m.diff} RD</div>
          </div>
        )
      })}
    </div>
  )
}

function SplitBars({ p, color }: { p: TeamProfile; color: string }) {
  if (p.splitBars.length === 0) return <Empty>Record splits unavailable.</Empty>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {p.splitBars.map(s => {
        const pct = s.pct ?? 0
        return (
          <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0,1fr) 62px', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#5b5347' }}>{s.label}</span>
            <div style={{ position: 'relative', height: 9, background: C.soft, borderRadius: 5 }}>
              <div style={{ width: `${pct * 100}%`, height: '100%', background: pct >= 0.5 ? color : '#cfc8b8', borderRadius: 5 }} />
              <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#1A1A1A', opacity: 0.4 }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.ink, textAlign: 'right' }}>{s.w}–{s.l}</span>
          </div>
        )
      })}
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>Bar = win % · line = .500</div>
    </div>
  )
}

function StandingsTable({ rows, title, useWc }: { rows: DivisionRow[]; title: string; useWc?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute, marginBottom: 6 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
        <thead>
          <tr style={{ color: C.faint, textAlign: 'right', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            <th style={{ textAlign: 'left', fontWeight: 400, padding: '3px 0' }}>Club</th><th style={{ fontWeight: 400 }}>W–L</th><th style={{ fontWeight: 400 }}>Pct</th><th style={{ fontWeight: 400 }}>{useWc ? 'WC GB' : 'GB'}</th><th style={{ fontWeight: 400 }}>RD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ textAlign: 'right', background: r.isMe ? '#FFF3E0' : 'transparent', fontWeight: r.isMe ? 700 : 400, borderTop: `1px solid ${C.soft}` }}>
              <td style={{ textAlign: 'left', padding: '6px 4px' }}>{r.abbr}</td>
              <td>{r.w}–{r.l}</td><td>{f3(r.pct)}</td><td>{useWc ? r.wcgb : r.gb}</td>
              <td style={{ color: r.diff >= 0 ? C.good : C.bad }}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SeasonSection({ team, profile: p, isPro }: { team: Team; profile: TeamProfile; isPro: boolean }) {
  const s = p.row.st
  const story = p.story
  const rem = story?.remaining
  const luck = p.pythag?.luck ?? null

  return (
    <Section
      id="season" num="01" title="Where they are in the season"
      sub="The whole year, game by game: how the record was built, the hot and cold stretches, and what is left to play."
    >
      <div className="tp-tiles">
        <Tile label="Win %" value={f3(s.pct)} sub={`${s.w}–${s.l}`} />
        <Tile label="Run differential" value={`${s.diff > 0 ? '+' : ''}${s.diff}`} tone={s.diff >= 0 ? 'good' : 'bad'} sub={`${(s.rs / Math.max(s.gp, 1)).toFixed(2)} RS/G · ${(s.ra / Math.max(s.gp, 1)).toFixed(2)} RA/G`} />
        <Tile
          label="vs run-diff record" value={luck == null ? '—' : `${luck > 0 ? '+' : ''}${luck.toFixed(1)} W`}
          tone={luck == null ? null : luck >= 0 ? 'good' : 'bad'}
          sub={luck == null ? undefined : luck >= 0 ? 'wins above what runs imply' : 'wins below what runs imply'}
        />
        <Tile label="Best 10 games" value={story?.bestStretch?.record ?? '—'} sub={story?.bestStretch ? `${story.bestStretch.from} – ${story.bestStretch.to}` : undefined} tone="good" />
        <Tile label="Worst 10 games" value={story?.worstStretch?.record ?? '—'} sub={story?.worstStretch ? `${story.worstStretch.from} – ${story.worstStretch.to}` : undefined} tone="bad" />
        <Tile label="Longest streaks" value={story ? `W${story.longestWin} · L${story.longestLoss}` : '—'} sub="this season" />
      </div>

      <div className="tp-grid-2" style={{ marginTop: 16 }}>
        <Card title="The season, game by game" note={story ? `${story.timeline.length} games` : undefined} style={{ gridColumn: 'span 2' }}>
          {story ? <SeasonTimelineChart points={story.timeline} color={team.primary_color} /> : <Empty>Game log unavailable right now.</Empty>}
        </Card>
      </div>

      <div className="tp-grid-2" style={{ marginTop: 16 }}>
        <Card title="Month by month" note="win % · run diff (RD)"><MonthBars p={p} color={team.primary_color} /></Card>
        <Card title="How they win: record splits"><SplitBars p={p} color={team.primary_color} /></Card>
      </div>

      <div className="tp-grid-2" style={{ marginTop: 16 }}>
        <Card title="The race">
          <StandingsTable rows={p.division} title={`${team.league} ${team.division}`} />
          <div style={{ height: 14 }} />
          <StandingsTable rows={p.wildCard} title={`${team.league} — best of the rest (wild-card chase)`} useWc />
          <Foot>Wild-card list = the six best non-division-leaders in the league by win %. Elimination and magic numbers come from MLB&apos;s standings.</Foot>
        </Card>

        <Card title="What is left" note={rem ? `${rem.games} games` : undefined}>
          {rem && rem.games > 0 ? (
            <>
              <div className="tp-tiles-2">
                <Tile label="Home / road" value={`${rem.home} / ${rem.away}`} />
                <Tile label="vs division" value={String(rem.divisional)} sub={`of ${rem.games}`} />
                <Tile label="vs .500+ clubs" value={String(rem.vsWinningClubs)} sub={`of ${rem.games}`} />
                <Tile label="Avg opp win %" value={rem.avgOppPct != null ? f3(rem.avgOppPct) : '—'} sub="league avg .500" tone={rem.avgOppPct == null ? null : rem.avgOppPct > 0.5 ? 'bad' : 'good'} />
              </div>
              <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: C.mute }}>Next {rem.upcoming.length} opponents · height = opponent win %</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 92, marginTop: 6 }}>
                {rem.upcoming.map((u, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} title={`${u.date} ${u.isHome ? 'vs' : '@'} ${u.oppAbbr}${u.oppPct != null ? ` · ${f3(u.oppPct)}` : ''}`}>
                    <div style={{ height: 60, display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${u.oppPct != null ? Math.max(((u.oppPct - 0.3) / 0.4) * 100, 6) : 6}%`, background: u.oppPct != null && u.oppPct >= 0.5 ? '#D4533B' : '#cfc8b8', borderRadius: '4px 4px 0 0' }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.ink, marginTop: 3 }}>{u.oppAbbr}</div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: C.faint }}>{u.isHome ? 'vs' : '@'}</div>
                  </div>
                ))}
              </div>
              <Foot>Opponent win % is their record today. Above .500 (red) = a club currently winning more than it loses.</Foot>
            </>
          ) : (
            <Empty>No regular-season games remain on the schedule.</Empty>
          )}
        </Card>
      </div>
      <div style={{ marginTop: 16 }}><SeasonPro team={team} profile={p} isPro={isPro} /></div>
      <p style={{ fontFamily: SANS, fontSize: 12, color: C.faint, margin: '12px 0 0', fontStyle: 'italic' }}>
        The Pythagorean record is a descriptive comparison of wins with runs scored and allowed — it says how the record lines up with the run differential, not what will happen next.
      </p>
    </Section>
  )
}
