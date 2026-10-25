'use client'

// src/components/games/LastTimePanel.tsx
//
// "When did this last happen?" for whatever is selected in a game: a pitch, a batted ball, or the whole
// plate appearance. Three kinds of match:
//   This pitch      → /api/stats/pitch-match (the batter's own pitch log: same pitch type, spot and speed)
//   This contact    → /api/stats/query, view=recent, with an exit-velocity / launch-angle window
//   This situation  → /api/stats/query, view=recent, with outs / runners / score / count … chips
// The two query searches reuse the same engine as /mlb/stats/live. Everything is Pro: isPro is a required prop,
// nothing is searched without it, and the APIs re-check the session themselves.
//
// On a finished game only earlier games count ("when had this happened BEFORE?"); on a live game the game
// itself is left out. Nothing is estimated: no match means an empty state, never a loosened search.

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'
import type { ExGame, ExPitch, ExPlay } from '@/lib/game-explorer'
import type { RecentHit } from '@/lib/stats-query'
import type { PitchMatchResult } from '@/lib/pitch-match'
import { BASE_CHIP, CURRENT_SEASON, MATCH_LEVELS, describeDeep, hitFromRef, type DeepFilters, type Who } from '@/lib/stats-query-catalog'
import { MLB_TEAMS } from '@/lib/teams'
import { baseText, ord, zoneWords } from '@/components/games/gamesUi'

type Mode = 'pitch' | 'contact' | 'ab'
type Scope = 'batter' | 'pitcher' | 'club' | 'lineup' | 'anyone'
type Row = { key: string; date: string; gamePk: number | null; who: string; against: string; result: string; detail: string }

const POST_TYPES = new Set(['F', 'D', 'L', 'W'])
const DESC: Record<string, string> = {
  swinging_strike: 'Swinging strike', swinging_strike_blocked: 'Swinging strike', called_strike: 'Called strike', foul: 'Foul', foul_tip: 'Foul tip',
  ball: 'Ball', blocked_ball: 'Ball', hit_into_play: 'In play', hit_by_pitch: 'Hit by pitch', foul_bunt: 'Foul', missed_bunt: 'Missed bunt',
}
const niceDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const abbrOf = (teamId: number) => MLB_TEAMS.find(t => t.id === teamId)?.abbrev

const chip = (on: boolean, disabled = false): React.CSSProperties => ({
  fontFamily: SANS, fontWeight: 600, fontSize: 12, padding: '4px 11px', borderRadius: 4, border: `1px solid ${on ? C.ink : C.line}`,
  background: on ? C.ink : '#fff', color: on ? '#fff' : C.ink, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
})
const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', margin: '12px 0 5px' }

export default function LastTimePanel({ game, play, pitch, isPro }: { game: ExGame; play: ExPlay; pitch: ExPitch | null; isPro: boolean }) {
  const past = game.state !== 'Live'
  const season = Number(game.date.slice(0, 4)) || CURRENT_SEASON
  const hasContact = pitch?.ev != null
  const [modeS, setModeS] = useState<Mode>(pitch ? 'pitch' : 'ab')
  const [scopeS, setScopeS] = useState<Scope>('batter')
  const [span, setSpan] = useState(3)                               // seasons, ending with this game's season
  const [gameType, setGameType] = useState(POST_TYPES.has(game.gameType) ? 'P' : 'R')
  const [on, setOn] = useState({ outs: true, runners: true, score: true, inning: false, count: false, stand: false, throws: false })
  const [matchCount, setMatchCount] = useState(false)

  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [tally, setTally] = useState<{ key: string; n: number }[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const run = useRef(0)                       // search counter: a stale answer is dropped if a newer search started

  // The parent re-mounts this panel (key) whenever a different pitch or plate appearance is selected, so state
  // starts fresh; changing any option here clears the previous answer.
  const reset = useCallback(() => { run.current++; setRows(null); setTotal(null); setErr(null); setProgress(null); setBusy(false); setNote(null) }, [])
  const mode: Mode = modeS === 'contact' && !hasContact ? (pitch ? 'pitch' : 'ab') : modeS === 'pitch' && !pitch ? 'ab' : modeS
  const scope: Scope = mode === 'pitch' && scopeS !== 'batter' && scopeS !== 'pitcher' ? 'batter' : scopeS
  const setMode = useCallback((m: Mode) => { setModeS(m); reset() }, [reset])
  const setScope = useCallback((c: Scope) => { setScopeS(c); reset() }, [reset])
  const pickSpan = useCallback((n: number) => { setSpan(n); reset() }, [reset])
  const pickType = useCallback((t: string) => { setGameType(t); reset() }, [reset])
  const flip = useCallback((k: keyof typeof on) => { setOn(o => ({ ...o, [k]: !o[k] })); reset() }, [reset])
  const flipCount = useCallback(() => { setMatchCount(v => !v); reset() }, [reset])

  const battingAbbr = abbrOf(play.half === 'Top' ? game.away.id : game.home.id)
  const fieldingTeam = play.half === 'Top' ? game.home : game.away
  const fieldingAbbr = abbrOf(fieldingTeam.id)

  const who: Who | undefined = useMemo(() => {
    if (scope === 'batter') return { playerId: play.batterId, playerName: play.batter, playerRole: 'bat' }
    if (scope === 'pitcher') return { playerId: play.batterId, playerName: play.batter, playerRole: 'bat', opponentId: play.pitcherId }
    if (scope === 'club') return fieldingAbbr ? { playerId: play.batterId, playerName: play.batter, playerRole: 'bat', team: fieldingAbbr, teamRole: 'field' } : undefined
    if (scope === 'lineup') return battingAbbr ? { team: battingAbbr, teamRole: 'bat' } : undefined
    return undefined
  }, [scope, play, fieldingAbbr, battingAbbr])
  const scopeOk = scope === 'anyone' || (scope === 'club' ? !!fieldingAbbr : scope === 'lineup' ? !!battingAbbr : true)

  const countKnown = play.complete
  const deep: DeepFilters | null = useMemo(() => {
    if (mode === 'pitch') return null
    const stack: string[] = []
    const d: DeepFilters = { stack, who }
    if (mode === 'contact' && pitch?.ev != null) {
      const { hit } = hitFromRef({ ev: pitch.ev, la: pitch.la, dist: pitch.dist }, MATCH_LEVELS[1].tol, { result: false, ev: true, la: true, dist: false, type: false })
      d.hit = { ...hit, rank: 'recent' }
      return d
    }
    if (on.outs) stack.push(`o${play.outs}`)
    if (on.runners) stack.push(BASE_CHIP[play.baseState] ?? 'r0')
    if (on.score) stack.push(play.scoreDiff > 0 ? 'sah' : play.scoreDiff < 0 ? 'sbh' : 'sti')
    if (on.count && countKnown) stack.push(`c${play.balls}${play.strikes}`)
    if (on.stand && (play.stand === 'L' || play.stand === 'R')) stack.push(play.stand === 'L' ? 'l' : 'r')
    if (on.throws && (play.throws === 'L' || play.throws === 'R')) stack.push(play.throws === 'L' ? 'vl' : 'vr')
    if (on.inning) { d.inningFrom = play.inning; if (play.inning < 7) d.inningTo = play.inning }
    return d
  }, [mode, who, pitch, on, play, countKnown])

  const criteria: string[] = useMemo(() => {
    if (mode === 'pitch' && pitch) return [pitch.typeName, pitch.speed != null ? `${Math.round(pitch.speed - 3)}–${Math.round(pitch.speed + 3)} mph` : '', zoneWords(pitch.x, pitch.z, play.stand, play.szTop, play.szBottom), matchCount ? `${pitch.countBefore} count` : ''].filter(Boolean)
    return deep ? describeDeep(deep) : []
  }, [mode, pitch, play, matchCount, deep])

  const beforeThisGame = <T extends { date: string; gamePk: number | null }>(r: T) => (past ? r.date < game.date : r.gamePk !== game.gamePk)

  const find = async () => {
    const id = ++run.current
    setBusy(true); setErr(null); setRows(null); setProgress(null); setNote(null)
    const from = Math.max(2015, season - span + 1)
    try {
      if (mode === 'pitch' && pitch && pitch.x != null && pitch.z != null) {
        const q = new URLSearchParams({ batter: String(play.batterId), type: pitch.type, x: String(pitch.x), z: String(pitch.z), from: String(from), to: String(season) })
        if (pitch.speed != null) q.set('speed', String(pitch.speed))
        if (matchCount) q.set('count', pitch.countBefore)
        if (scope === 'pitcher') q.set('pitcher', String(play.pitcherId))
        const r = await fetch(`/api/stats/pitch-match?${q}`)
        const j = await r.json()
        if (id !== run.current) return
        if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`)
        const res = j as PitchMatchResult
        const kept = res.rows.filter(beforeThisGame)
        setRows(kept.map((m, i) => ({
          key: `${m.date}-${i}`, date: m.date, gamePk: m.gamePk, who: play.batter, against: m.pitcher,
          result: DESC[m.description ?? ''] ?? (m.description ?? '—').replace(/_/g, ' '),
          detail: [m.type, m.speed != null ? `${m.speed.toFixed(1)} mph` : '', m.count ? `count ${m.count}` : '', m.ev != null ? `EV ${m.ev.toFixed(1)}` : ''].filter(Boolean).join(' · '),
        })))
        setTotal(res.total); setTally(res.tally)
        setNote(`Regular-season pitches only.${res.missingSeasons.length ? ` No pitch data found for ${res.missingSeasons.join(', ')}.` : ''}`)
        return
      }
      if (!deep) return
      const url = `/api/stats/query?group=hitting&gameType=${gameType}&from=${from}&to=${season}&view=recent&deep=${encodeURIComponent(JSON.stringify(deep))}`
      // Savant days are pulled in batches: keep asking until the whole range is in.
      for (let i = 0; i < 400; i++) {
        const r = await fetch(url)
        const j = await r.json()
        if (id !== run.current) return
        if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`)
        if (j.loading) { setProgress(j.loading); continue }
        const recent = (j.recent ?? []) as RecentHit[]
        const kept = recent.map(h => ({ h, date: h.date, gamePk: h.gamePk as number | null })).filter(beforeThisGame).map(x => x.h)
        setRows(kept.map((h, i) => ({
          key: `${h.gamePk}-${h.atBat}-${i}`, date: h.date, gamePk: h.gamePk, who: h.batter, against: h.pitcher,
          result: h.event,
          detail: [`${h.half === 'Top' ? 'Top' : 'Bot'} ${ord(h.inning)}`, `${h.outs} out`, h.ev != null ? `EV ${h.ev.toFixed(1)}${h.la != null ? ` · ${Math.round(h.la)}°` : ''}` : '', `${h.awayTeam} @ ${h.homeTeam}`].filter(Boolean).join(' · '),
        })))
        setTotal(typeof j.recentTotal === 'number' ? j.recentTotal : null); setTally([])
        setProgress(null)
        return
      }
      throw new Error('That range is taking too long to load — try fewer seasons.')
    } catch (e) {
      if (id === run.current) setErr((e as Error).message)
    } finally {
      if (id === run.current) setBusy(false)
    }
  }

  const heading = past ? 'When had this happened before?' : 'When did this last happen?'
  const subject = mode === 'pitch' && pitch ? `pitch ${pitch.n}` : mode === 'contact' ? 'the batted ball' : 'this plate appearance'

  if (!isPro) {
    return (
      <div style={{ fontFamily: SANS }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>⊕ {heading}</h3>
        <div style={{ border: `1.5px dashed ${C.ink}`, borderRadius: 14, padding: 18, background: '#fff' }}>
          <span style={{ display: 'inline-block', background: C.yellow, fontWeight: 800, fontSize: 9, letterSpacing: '.1em', borderRadius: 5, padding: '2px 6px' }}>PRO</span>
          <h4 style={{ margin: '6px 0 4px', fontSize: 17, fontWeight: 800 }}>Find the last time something like this happened</h4>
          <ul style={{ margin: '6px 0 12px', paddingLeft: 18, color: '#5b5347', fontSize: 13 }}>
            <li>Choose any pitch, batted ball or whole plate appearance</li>
            <li>Match it for this batter, against this pitcher or club, or across the lineup</li>
            <li>Filter by season span and game type, with the sample behind every answer</li>
          </ul>
          <Link href="/pricing" style={{ display: 'inline-block', background: C.orange, color: '#fff', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Unlock with Pro</Link>
        </div>
      </div>
    )
  }

  const toggles: { k: keyof typeof on; label: string; off?: boolean }[] = [
    { k: 'outs', label: `${play.outs} out${play.outs === 1 ? '' : 's'}` },
    { k: 'runners', label: baseText(play.baseState) },
    { k: 'score', label: play.scoreDiff === 0 ? 'Tied' : play.scoreDiff > 0 ? 'Batting team ahead' : 'Batting team behind' },
    { k: 'inning', label: play.inning >= 7 ? `${ord(play.inning)} inning or later` : `${ord(play.inning)} inning` },
    { k: 'count', label: `${play.balls}-${play.strikes} count`, off: !countKnown },
    { k: 'stand', label: `${play.stand === 'L' ? 'Left' : 'Right'}-handed batter` },
    { k: 'throws', label: `${play.throws === 'L' ? 'Left' : 'Right'}-handed pitcher` },
  ]
  const scopes: { k: Scope; label: string; off?: boolean }[] = [
    { k: 'batter', label: play.batter },
    { k: 'pitcher', label: `vs ${play.pitcher}` },
    { k: 'club', label: `vs ${fieldingTeam.abbr}`, off: mode === 'pitch' || !fieldingAbbr },
    { k: 'lineup', label: 'His club’s lineup', off: mode === 'pitch' || !battingAbbr },
    { k: 'anyone', label: 'Anyone in MLB', off: mode === 'pitch' },
  ]
  const toggleButtons = toggles.map(t => {
    // the react-hooks/refs rule can't see that flip() only touches the search counter from a click handler
    // eslint-disable-next-line react-hooks/refs
    const onClick = () => flip(t.k)
    return (
      <button key={t.k} type="button" disabled={t.off} aria-pressed={on[t.k]} style={chip(on[t.k] && !t.off, t.off)} onClick={onClick}
        title={t.off ? 'The count is only final once the plate appearance is over.' : undefined}>{t.label}</button>
    )
  })
  const last = rows && rows[0]

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <h3 style={{ margin: '0 0 3px', fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }}>⊕ {heading}</h3>
      {past && <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', background: C.soft, borderRadius: 6, padding: '3px 8px', color: '#5b5347', margin: '2px 0 6px' }}>Only games before {niceDate(game.date)} count</div>}
      <p style={{ fontSize: 13, color: '#5b5347', margin: '0 0 8px' }}>Based on <b>{subject}</b> — {play.batter}, {play.half.toLowerCase()} {play.inning}.</p>

      <div role="group" aria-label="What to match" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {([['pitch', 'This pitch', 'type · spot · speed', !pitch], ['contact', 'This contact', 'exit velo · angle', !hasContact], ['ab', 'This situation', 'outs · runners · score', false]] as [Mode, string, string, boolean][]).map(([k, t, s, off]) => (
          <button key={k} type="button" disabled={off} onClick={() => setMode(k)} aria-pressed={mode === k}
            title={off ? (k === 'contact' ? 'This pitch was not put in play.' : 'No pitch is selected.') : undefined}
            style={{ border: `1px solid ${mode === k ? C.ink : C.line}`, background: mode === k ? C.ink : '#fff', color: mode === k ? '#fff' : C.ink, borderRadius: 10, padding: '8px 6px', fontWeight: 700, fontSize: 12, lineHeight: 1.25, opacity: off ? 0.4 : 1, cursor: off ? 'not-allowed' : 'pointer', fontFamily: SANS }}>
            {t}<small style={{ display: 'block', fontWeight: 500, fontSize: 10.5, opacity: 0.75 }}>{s}</small>
          </button>
        ))}
      </div>

      <div style={lbl}>Match on</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {mode === 'ab' ? toggleButtons : mode === 'pitch' ? (
          <>
            {criteria.filter(c => !c.endsWith('count')).map(c => <span key={c} style={{ ...chip(false), cursor: 'default' }}>{c}</span>)}
            {pitch && <button type="button" aria-pressed={matchCount} style={chip(matchCount)} onClick={flipCount}>{pitch.countBefore} count</button>}
          </>
        ) : (
          <>
            {criteria.map(c => <span key={c} style={{ ...chip(false), cursor: 'default' }}>{c}</span>)}
            <span style={{ ...chip(false), cursor: 'default' }}>any result</span>
          </>
        )}
      </div>

      <div style={lbl}>Whose history</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {scopes.map(s => <button key={s.k} type="button" disabled={s.off} aria-pressed={scope === s.k} style={chip(scope === s.k, s.off)} onClick={() => setScope(s.k)} title={s.off ? (mode === 'pitch' ? 'Pitch matching reads this batter’s own pitch log.' : 'Not available.') : undefined}>{s.label}</button>)}
      </div>

      <div style={lbl}>When</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {[1, 3, 5].map(n => <button key={n} type="button" aria-pressed={span === n} style={chip(span === n)} onClick={() => pickSpan(n)}>{n === 1 ? `${season} only` : `${season - n + 1}–${season}`}</button>)}
        {mode !== 'pitch' && <>
          <button type="button" aria-pressed={gameType === 'R'} style={chip(gameType === 'R')} onClick={() => pickType('R')}>Regular season</button>
          <button type="button" aria-pressed={gameType === 'P'} style={chip(gameType === 'P')} onClick={() => pickType('P')}>Postseason</button>
        </>}
      </div>

      <button type="button" disabled={busy || !scopeOk} onClick={find}
        style={{ marginTop: 14, width: '100%', fontFamily: SANS, fontWeight: 800, fontSize: 14, padding: '11px 16px', borderRadius: 8, border: 'none', background: busy ? C.line : C.orange, color: '#fff', cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Searching…' : past ? 'Find the most recent time before this game' : 'Find the last time this happened'}
      </button>

      {progress && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Loading {progress.done} of {progress.total} game days</div>
          <div style={{ height: 8, background: C.soft, borderRadius: 4, margin: '6px 0', overflow: 'hidden' }}><div style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`, height: '100%', background: C.orange, transition: 'width .3s' }} /></div>
          <div style={{ fontSize: 11, color: C.mute }}>First search of a season only — finished days are kept, so the next one is instant.</div>
        </div>
      )}
      {err && <div style={{ color: C.bad, fontSize: 13, marginTop: 10 }}>{err}</div>}

      {rows && rows.length === 0 && (
        <div style={{ marginTop: 12, border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 14, textAlign: 'center', color: C.mute, fontSize: 13 }}>
          <b style={{ display: 'block', color: C.ink }}>No matches in this window</b>
          Nothing this close{scope === 'pitcher' ? ` between ${play.batter} and ${play.pitcher}` : ''} — try more seasons or a wider whose-history. We never loosen a match without telling you.
        </div>
      )}
      {rows && last && (
        <div style={{ marginTop: 12 }}>
          <div style={{ borderLeft: `4px solid ${C.orange}`, background: '#fff7f3', borderRadius: '0 12px 12px 0', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }}>{past ? 'Most recent before this game' : 'Last time'}</div>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.01em', lineHeight: 1.15 }}>{niceDate(last.date)}</div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>{last.who} vs {last.against} — <b style={{ color: C.ink }}>{last.result}</b>.{' '}
              {last.gamePk && <Link href={`/mlb/stats/games/${last.gamePk}`} style={{ color: C.orange, fontWeight: 700, textDecoration: 'none' }}>Open that game →</Link>}</p>
          </div>
          {tally.length > 0 && total != null && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#5b5347' }}>
              <b style={{ color: C.ink }}>{total} like it</b> in the window: {tally.slice(0, 5).map(t => `${DESC[t.key] ?? t.key.replace(/_/g, ' ')} ${t.n}`).join(' · ')}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 10 }}>
            <thead><tr>{['Date', 'Against', 'Result'].map(h => <th key={h} style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute, textAlign: 'left', padding: '5px 6px', fontWeight: 700, borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 8).map(r => (
                <tr key={r.key}>
                  <td style={{ padding: '7px 6px', borderBottom: `1px solid ${C.soft}`, verticalAlign: 'top' }}>{r.gamePk ? <Link href={`/mlb/stats/games/${r.gamePk}`} style={{ color: C.ink }}>{niceDate(r.date)}</Link> : niceDate(r.date)}</td>
                  <td style={{ padding: '7px 6px', borderBottom: `1px solid ${C.soft}`, verticalAlign: 'top' }}>{scope === 'lineup' || scope === 'anyone' ? `${r.who} vs ${r.against}` : r.against}</td>
                  <td style={{ padding: '7px 6px', borderBottom: `1px solid ${C.soft}`, verticalAlign: 'top' }}><b>{r.result}</b><small style={{ display: 'block', color: C.mute, fontSize: 11 }}>{r.detail}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 9.5, color: C.faint, marginTop: 8 }}>Showing the latest {Math.min(8, rows.length)}{total != null && !past ? ` of ${total}` : ''}. {note}</div>
        </div>
      )}
      <div style={{ fontSize: 9.5, color: C.faint, marginTop: 10, lineHeight: 1.45 }}>Matches are pitches and plate appearances already recorded. They describe what happened, not what comes next.</div>
    </div>
  )
}
