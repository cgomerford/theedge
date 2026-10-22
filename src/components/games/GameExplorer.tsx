'use client'

// src/components/games/GameExplorer.tsx
//
// One game, in full: scorebug hero, final box (finished games), every plate appearance (play by play), every
// player, the pitches of any plate appearance on a strike-zone chart, and the "when did this last happen?"
// panel for whatever pitch / batted ball / plate appearance is selected.
//
// A live game re-reads /api/stats/game/{pk} every 15 s. isPro is a required prop and never defaulted; the Pro
// panel only builds its searches when isPro is true (the APIs re-check the session themselves).

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { C, SANS } from '@/components/team/ui'
import { playerHeadshotUrl } from '@/lib/mlb'
import type { ExGame, ExPitch, ExPlay } from '@/lib/game-explorer'
import { baseText, CALL_COLOR, CALL_LABEL, Diamond, GAMES_CSS, ord, teamColors, zoneWords } from '@/components/games/gamesUi'
import LastTimePanel from '@/components/games/LastTimePanel'
import FieldView, { FIELD_CSS } from '@/components/games/FieldView'

const pad = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, minWidth: 0 } as const
const kick: React.CSSProperties = { fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase', margin: '0 0 3px' }

export const playResult = (p: ExPlay) => {
  if (!p.complete) return `In progress · count ${p.balls}-${p.strikes}`
  const last = [...p.pitches].reverse().find(x => x.ev != null)
  return `${p.event}${last?.ev != null ? ` · EV ${last.ev.toFixed(1)}` : ''}`
}

function ZoneChart({ play, sel, onSel, reveal, fresh }: { play: ExPlay; sel: number; onSel: (i: number) => void; reveal: number; fresh: number }) {
  // The view is -1.6…1.6 ft across and 0.6…4.4 ft high, and grows (never shrinks) to keep every pitch of this
  // plate appearance in frame — a ball in the dirt or well off the plate would otherwise be clipped. It is sized
  // from ALL the pitches, not just the revealed ones, so the chart doesn't jump while the pitches play back.
  const S = 80, M = 0.3
  let minX = -1.6, maxX = 1.6, minZ = 0.6, maxZ = 4.4
  for (const p of play.pitches) {
    if (p.x == null || p.z == null) continue
    minX = Math.min(minX, p.x - M); maxX = Math.max(maxX, p.x + M); minZ = Math.min(minZ, p.z - M); maxZ = Math.max(maxZ, p.z + M)
  }
  const W = (maxX - minX) * S, H = (maxZ - minZ) * S
  const px = (x: number) => (x - minX) * S, pz = (z: number) => (maxZ - z) * S
  const top = play.szTop ?? 3.5, bot = play.szBottom ?? 1.5
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Pitch locations from the catcher's view">
      <rect x={px(-0.83)} y={pz(top)} width={1.66 * S} height={(top - bot) * S} fill="#fff" stroke="#1A1A1A" strokeWidth={2} />
      {[1, 2].map(i => <g key={i}><line x1={px(-0.83) + (i * 1.66 * S) / 3} y1={pz(top)} x2={px(-0.83) + (i * 1.66 * S) / 3} y2={pz(bot)} stroke="#e7e2d8" /><line x1={px(-0.83)} y1={pz(top) + (i * (top - bot) * S) / 3} x2={px(0.83)} y2={pz(top) + (i * (top - bot) * S) / 3} stroke="#e7e2d8" /></g>)}
      <polygon points={`${px(-0.7)},${H - 8} ${px(0.7)},${H - 8} ${px(0.7)},${H - 20} ${px(0)},${H - 30} ${px(-0.7)},${H - 20}`} fill="#f1eee6" stroke="#a89e8c" />
      <text x={8} y={16} fontSize={10} fill="#a89e8c" fontWeight={700}>{play.stand === 'R' ? 'RHB' : 'LHB'} · catcher&apos;s view</text>
      {/* the trail: a line that draws from the release point to the ball as it travels, then fades out */}
      {(() => {
        const p = play.pitches[fresh]
        if (!p || p.x == null || p.z == null || fresh >= reveal) return null
        const x1 = px(0), y1 = pz(5.2), x2 = px(p.x), y2 = pz(p.z)
        const len = Math.hypot(x2 - x1, y2 - y1)
        return <line key={`trail-${play.id}-${fresh}`} className="gm-trail" x1={x1} y1={y1} x2={x2} y2={y2} stroke={CALL_COLOR[p.call]} strokeWidth={4} strokeLinecap="round"
          style={{ ['--len' as string]: `${len}`, strokeDasharray: len, strokeDashoffset: len }} pointerEvents="none" />
      })()}
      {play.pitches.map((p, i) => p.x == null || p.z == null || i >= reveal ? null : (
        <g key={i} transform={`translate(${px(p.x)} ${pz(p.z)})`} style={{ cursor: 'pointer' }} tabIndex={0} role="button" aria-label={`Pitch ${p.n}, ${p.typeName}, ${CALL_LABEL[p.call]}`}
          onClick={() => onSel(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(i) } }}>
          {/* the pitch flies in from the release point (small, high, centred) and grows to its spot over the plate */}
          <g className={i === fresh ? 'gm-fly' : undefined} style={{ ['--dx' as string]: `${px(0) - px(p.x)}px`, ['--dy' as string]: `${pz(5.2) - pz(p.z)}px` }}>
            <circle r={i === sel ? 15 : 12} fill={CALL_COLOR[p.call]} stroke={i === sel ? '#1A1A1A' : '#fff'} strokeWidth={i === sel ? 3 : 1.5} />
            <text y={4} fontSize={12} fontWeight={800} fill="#fff" textAnchor="middle" pointerEvents="none">{p.n}</text>
          </g>
        </g>
      ))}
    </svg>
  )
}

function Face({ id, name, ring }: { id: number; name: string; ring: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={playerHeadshotUrl(id, 120)} alt={name} width={64} height={64}
      style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', background: C.soft, border: `3px solid ${ring}`, flex: 'none' }} />
  )
}

/** Plays a plate appearance back pitch by pitch (one every 0.8 s) into the zone, with the count updating as it goes. */
function PitchStage({ play, sel, onSel, onDone, onReplay }: { play: ExPlay; sel: number; onSel: (i: number) => void; onDone: (id: number) => void; onReplay: () => void }) {
  const n = play.pitches.length
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [reveal, setReveal] = useState(reduced ? n : 0)
  const [fresh, setFresh] = useState(-1)
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (reveal >= n) return
    // the first pitch of a replay waits a beat so the eye is on the zone; later ones follow at a steady pace
    const id = setTimeout(() => { setFresh(reveal); setReveal(reveal + 1); if (reveal + 1 >= n) setTimeout(() => onDone(play.id), 900) }, reveal === 0 ? 350 : 800)
    return () => clearTimeout(id)
  }, [reveal, n, run, onDone, play.id])

  const replay = () => { setFresh(-1); setReveal(0); setRun(r => r + 1); onReplay() }
  const shown = Math.min(reveal, n)
  const count = shown === 0 ? '0-0' : shown < n ? play.pitches[shown].countBefore : play.complete ? `${play.balls}-${play.strikes}` : `${play.balls}-${play.strikes}`
  const done = shown >= n
  return (
    <div>
      <ZoneChart play={play} sel={Math.min(sel, Math.max(0, shown - 1))} onSel={onSel} reveal={reveal} fresh={fresh} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Count <b style={{ fontSize: 16 }}>{count}</b> <span style={{ color: C.mute, fontWeight: 500 }}>· pitch {Math.min(shown, n)} of {n}</span></span>
        <button type="button" onClick={replay} className="gm-btn" aria-label="Replay the pitches"
          style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 999, padding: '4px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          {done ? '↻ Replay' : '… playing'}
        </button>
      </div>
    </div>
  )
}

export default function GameExplorer({ initial, isPro }: { initial: ExGame; isPro: boolean }) {
  const [game, setGame] = useState(initial)
  const [selAb, setSelAb] = useState<number | null>(null)
  const [selPitch, setSelPitch] = useState(0)
  const [tab, setTab] = useState<'feed' | 'players'>('feed')
  const [filter, setFilter] = useState<number | null>(null)       // player id
  const [stageDone, setStageDone] = useState<number | null>(null)   // plate appearance whose pitch playback has finished
  const live = game.state === 'Live', fin = game.state === 'Final'

  // live games re-read every 15 s (and stop on their own once MLB says the game is over)
  useEffect(() => {
    if (game.state !== 'Live') return
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/stats/game/${game.gamePk}`)
        if (r.ok) setGame(await r.json() as ExGame)
      } catch { /* keep the last good data; the next tick tries again */ }
    }, 15_000)
    return () => clearInterval(id)
  }, [game.state, game.gamePk])

  const plays = game.plays
  // default selection: the live at-bat, else the first scoring play, else the first plate appearance
  const defaultAb = useMemo(() => {
    if (!plays.length) return null
    if (live) return plays[plays.length - 1].id
    return (plays.find(p => p.scoring) ?? plays[0]).id
  }, [plays, live])
  const abId = selAb ?? defaultAb
  const play = plays.find(p => p.id === abId) ?? null
  const pitchIdx = play ? Math.min(selPitch, Math.max(0, play.pitches.length - 1)) : 0
  const pitch: ExPitch | null = play?.pitches[pitchIdx] ?? null

  const pick = useCallback((p: ExPlay) => { setSelAb(p.id); setSelPitch(Math.max(0, p.pitches.length - 1)) }, [])
  const listed = useMemo(() => {
    const l = plays.filter(p => filter == null || p.batterId === filter || p.pitcherId === filter)
    return live ? [...l].reverse() : l                                   // live: newest first; finished: in order
  }, [plays, filter, live])
  const filterName = filter == null ? null : [...game.lineups.away.batters, ...game.lineups.away.pitchers, ...game.lineups.home.batters, ...game.lineups.home.pitchers].find(p => p.id === filter)?.name

  const A = teamColors(game.away.id), H = teamColors(game.home.id)
  const scoring = plays.filter(p => p.scoring)
  const cols = Math.max(9, game.innings.length)

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <style>{GAMES_CSS + FIELD_CSS}</style>

      {/* ── hero ── */}
      <div style={{ borderRadius: 14, color: '#fff', padding: '18px 22px', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap', background: `linear-gradient(90deg, ${A.primary} 0 50%, ${H.primary} 50% 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: A.text }}>
          <div><div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, opacity: .85 }}>{game.away.name}</div><div style={{ fontWeight: 800, fontSize: 'clamp(30px,5vw,48px)', letterSpacing: '-.02em', lineHeight: 1 }}>{game.away.abbr}</div></div>
          <div style={{ fontWeight: 800, fontSize: 'clamp(40px,6vw,64px)', lineHeight: 1 }}>{game.awayRuns}</div>
        </div>
        <div style={{ flex: 1, minWidth: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, flexWrap: 'wrap', background: 'rgba(0,0,0,.32)', borderRadius: 12, padding: '10px 16px', color: '#fff' }}>
          {live ? (
            <>
              <div><small style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .8, fontWeight: 700 }}><i className="gm-live" />Live</small><b style={{ fontSize: 20 }}>{game.half === 'Top' ? 'Top' : 'Bot'} {ord(game.inning)}</b></div>
              <Diamond mask={game.baseState} size={54} ink="#fff" off="transparent" />
              <div><small style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .8, fontWeight: 700 }}>Count · Outs</small><b style={{ fontSize: 20 }}>{game.balls}-{game.strikes} · {game.outs}</b></div>
              <div><small style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .8, fontWeight: 700 }}>At bat</small><b style={{ fontSize: 15 }}>{game.currentBatter}</b></div>
            </>
          ) : (
            <>
              <div><small style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .8, fontWeight: 700 }}>Status</small><b style={{ fontSize: 20 }}>{fin ? `Final · ${new Date(`${game.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : game.detailed || 'Upcoming'}</b></div>
              {fin && game.decisions.winner && <div><small style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .8, fontWeight: 700 }}>Winning pitcher</small><b style={{ fontSize: 15 }}>{game.decisions.winner}</b></div>}
              {fin && game.decisions.loser && <div><small style={{ display: 'block', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .8, fontWeight: 700 }}>Losing pitcher</small><b style={{ fontSize: 15 }}>{game.decisions.loser}</b></div>}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: 'row-reverse', textAlign: 'right', color: H.text }}>
          <div><div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, opacity: .85 }}>{game.home.name}</div><div style={{ fontWeight: 800, fontSize: 'clamp(30px,5vw,48px)', letterSpacing: '-.02em', lineHeight: 1 }}>{game.home.abbr}</div></div>
          <div style={{ fontWeight: 800, fontSize: 'clamp(40px,6vw,64px)', lineHeight: 1 }}>{game.homeRuns}</div>
        </div>
      </div>

      {/* ── final box + scoring plays (any game with a result so far) ── */}
      {game.state !== 'Preview' && (
        <div className="gm-sum">
          <div style={pad}>
            <h3 style={kick}>⊕ {fin ? 'Final box' : 'Line score'}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ color: C.faint, fontSize: 11 }}><th style={{ textAlign: 'left', padding: '2px 4px' }} />{Array.from({ length: cols }, (_, i) => <th key={i} style={{ padding: '2px 6px' }}>{i + 1}</th>)}<th style={{ padding: '2px 6px' }}>R</th><th style={{ padding: '2px 6px' }}>H</th><th style={{ padding: '2px 6px' }}>E</th></tr></thead>
                <tbody>
                  {([['away', game.away, game.awayRuns, game.awayHits, game.awayErrors], ['home', game.home, game.homeRuns, game.homeHits, game.homeErrors]] as const).map(([side, t, r, h, e]) => (
                    <tr key={side} style={{ textAlign: 'center', fontWeight: 600 }}>
                      <td style={{ textAlign: 'left', padding: '4px', fontWeight: 800 }}>{t.abbr}</td>
                      {Array.from({ length: cols }, (_, i) => <td key={i} style={{ padding: '4px 6px' }}>{game.innings[i]?.[side] ?? ''}</td>)}
                      <td style={{ fontWeight: 800, padding: '4px 6px' }}>{r}</td><td style={{ padding: '4px 6px' }}>{h}</td><td style={{ padding: '4px 6px' }}>{e}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fin && <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#5b5347', marginTop: 8 }}>
              {game.decisions.winner && <span>W <b style={{ color: C.ink }}>{game.decisions.winner}</b></span>}
              {game.decisions.loser && <span>L <b style={{ color: C.ink }}>{game.decisions.loser}</b></span>}
              {game.decisions.save && <span>SV <b style={{ color: C.ink }}>{game.decisions.save}</b></span>}
            </div>}
          </div>
          <div style={pad}>
            <h3 style={kick}>⊕ Scoring plays</h3>
            <p style={{ fontSize: 13, color: '#5b5347', margin: '0 0 8px' }}>Click one to open it and ask when it had happened before.</p>
            {scoring.length === 0 ? <div style={{ fontSize: 13, color: C.mute }}>No runs yet.</div> : (
              <div style={{ display: 'grid', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                {scoring.map(p => (
                  <button key={p.id} type="button" className="gm-btn" onClick={() => pick(p)}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', border: p.id === abId ? `2px solid ${C.orange}` : `1px solid ${C.line}`, background: p.id === abId ? '#fff7f3' : '#fff', borderRadius: 10, padding: '7px 10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.mute, textTransform: 'uppercase', width: 46, flex: 'none' }}>{p.half === 'Top' ? 'Top' : 'Bot'} {p.inning}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.batter} — {p.event}</span>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{game.away.abbr} {p.awayAfter} – {game.home.abbr} {p.homeAfter}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="gm-grid">
        {/* ── left: play by play + players ── */}
        <div style={pad}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }} role="tablist">
            {(['feed', 'players'] as const).map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                style={{ flex: 1, border: 0, background: tab === t ? C.ink : C.soft, color: tab === t ? '#fff' : C.mute, borderRadius: 8, padding: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                {t === 'feed' ? 'Play by play' : 'Players'}
              </button>
            ))}
          </div>
          {filter != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.ink, color: '#fff', borderRadius: 10, padding: '7px 10px', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              <span>Showing: {filterName}</span><button type="button" aria-label="Clear player filter" onClick={() => setFilter(null)} style={{ background: 'none', border: 0, color: '#fff', fontWeight: 800, cursor: 'pointer' }}>✕</button>
            </div>
          )}
          {tab === 'feed' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 640, overflow: 'auto' }}>
              {plays.length === 0 && <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 14, textAlign: 'center', color: C.mute, fontSize: 13 }}><b style={{ display: 'block', color: C.ink }}>No plate appearances yet</b>{game.state === 'Preview' ? 'The play by play starts at first pitch.' : 'MLB has not posted any plays for this game.'}</div>}
              {plays.length > 0 && listed.length === 0 && <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 14, textAlign: 'center', color: C.mute, fontSize: 13 }}><b style={{ display: 'block', color: C.ink }}>No plate appearances</b>{filterName} hasn&apos;t been in one in this game.</div>}
              {listed.map((p, i) => {
                const head = !live && (i === 0 || listed[i - 1].inning !== p.inning || listed[i - 1].half !== p.half)
                return (
                  <div key={p.id}>
                    {head && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase', padding: '8px 2px 2px' }}><b style={{ color: C.ink }}>{p.half} {p.inning}</b><span /></div>}
                    <button type="button" className="gm-btn" onClick={() => pick(p)} aria-pressed={p.id === abId}
                      style={{ width: '100%', textAlign: 'left', border: p.id === abId ? `2px solid ${C.orange}` : `1px solid ${C.line}`, background: p.id === abId ? '#fff7f3' : '#fff', borderRadius: 10, padding: p.id === abId ? '8px 10px' : '9px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: C.mute }}>
                        <span>{p.half} {p.inning} · {p.outs} out</span>{!p.complete && <span style={{ color: C.orange }}>● LIVE</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.batter} <span style={{ color: C.mute, fontWeight: 500 }}>vs {p.pitcher}</span></div>
                      <div style={{ fontSize: 12, color: '#5b5347' }}>{playResult(p)}</div>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ maxHeight: 640, overflow: 'auto' }}>
              {([['away', game.away], ['home', game.home]] as const).map(([side, t]) => (
                <div key={side}>
                  {(['batters', 'pitchers'] as const).map(k => (
                    <div key={k}>
                      <h4 style={{ margin: '12px 0 4px', fontSize: 10, letterSpacing: '.14em', color: C.mute, textTransform: 'uppercase' }}>{t.name} {k}</h4>
                      {game.lineups[side][k].length === 0 && <div style={{ fontSize: 12, color: C.faint, padding: '4px 8px' }}>Not posted yet.</div>}
                      {game.lineups[side][k].map(pl => (
                        <button key={pl.id} type="button" className="gm-btn" onClick={() => { setFilter(pl.id); setTab('feed') }}
                          style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', border: 0, background: 'none', textAlign: 'left', padding: '6px 8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <span>{pl.name} <span style={{ color: C.faint, fontWeight: 500, fontSize: 11 }}>{pl.pos}</span></span><span style={{ color: C.mute, fontWeight: 500, fontSize: 12 }}>{pl.line}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ fontSize: 9.5, color: C.faint, marginTop: 8 }}>Click anyone to see only their plate appearances in this game.</div>
            </div>
          )}
        </div>

        {/* ── centre: the selected plate appearance ── */}
        <div style={pad}>
          {!play ? (
            <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 24, textAlign: 'center', color: C.mute }}>
              <b style={{ display: 'block', color: C.ink }}>{game.state === 'Preview' ? 'This game has not started' : 'Nothing to show yet'}</b>
              {game.state === 'Preview' ? 'Once the first pitch is thrown, every plate appearance and pitch appears here.' : 'Select a plate appearance from the list.'}
            </div>
          ) : (
            <>
              <h3 style={kick}>⊕ {play.complete ? 'Plate appearance' : 'At bat now'}</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Face id={play.batterId} name={play.batter} ring={play.half === 'Top' ? A.primary : H.primary} />
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.15 }}>{play.batter}<div style={{ color: C.mute, fontWeight: 600, fontSize: 14 }}>({play.stand}HB) vs {play.pitcher} ({play.throws}HP)</div></div>
                  <Face id={play.pitcherId} name={play.pitcher} ring={play.half === 'Top' ? H.primary : A.primary} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, background: C.soft, padding: '3px 10px', color: '#5b5347' }}>{play.half} {play.inning} · {play.outs} out · {game.away.abbr} {play.awayAfter}–{play.homeAfter} {game.home.abbr}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, background: C.soft, padding: '3px 10px', color: '#5b5347' }}>{baseText(play.baseState)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, background: C.soft, padding: '3px 10px', color: '#5b5347' }}>{playResult(play)}</span>
              </div>
              {play.description && play.complete && <p style={{ fontSize: 13, color: '#5b5347', margin: '0 0 12px' }}>{play.description}</p>}
              {play.pitches.length === 0 ? (
                <div style={{ border: `1.5px dashed ${C.line}`, borderRadius: 12, padding: 16, textAlign: 'center', color: C.mute, fontSize: 13 }}><b style={{ display: 'block', color: C.ink }}>No pitch data</b>MLB did not record pitches for this plate appearance.</div>
              ) : (
                <div className="gm-pz">
                  <div>
                    <PitchStage key={play.id} play={play} sel={pitchIdx} onSel={setSelPitch} onDone={setStageDone} onReplay={() => setStageDone(null)} />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: C.mute, marginTop: 6 }}>
                      {(['ball', 'called_strike', 'swinging_strike', 'foul', 'in_play'] as const).map(k => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: 5, background: CALL_COLOR[k], display: 'inline-block' }} />{CALL_LABEL[k]}</span>)}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {play.pitches.map((p, i) => (
                        <button key={i} type="button" className="gm-btn" onClick={() => setSelPitch(i)} aria-pressed={i === pitchIdx}
                          style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 9, alignItems: 'center', border: i === pitchIdx ? `2px solid ${C.orange}` : `1px solid ${C.line}`, borderRadius: 10, padding: i === pitchIdx ? '6px 9px' : '7px 10px', background: i === pitchIdx ? '#fff7f3' : '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <span style={{ width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, color: '#fff', background: CALL_COLOR[p.call] }}>{p.n}</span>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{p.typeName}{p.speed != null ? ` ${p.speed.toFixed(1)}` : ''}<small style={{ display: 'block', fontWeight: 500, color: C.mute, fontSize: 11 }}>{zoneWords(p.x, p.z, play.stand, play.szTop, play.szBottom)} · count {p.countBefore}</small></span>
                          <span style={{ fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{CALL_LABEL[p.call]}</span>
                        </button>
                      ))}
                      {!play.complete && live && <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: '7px 10px', color: C.mute, fontSize: 13 }}>Next pitch… <span style={{ fontSize: 11 }}>(updates every 15 seconds)</span></div>}
                    </div>
                    {pitch?.ev != null && (
                      <div style={{ marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                        {[[pitch.ev.toFixed(1), 'Exit velo'], [pitch.la != null ? `${Math.round(pitch.la)}°` : '—', 'Launch angle'], [pitch.dist != null ? `${Math.round(pitch.dist)}` : '—', 'Feet'], [play.complete ? play.event : 'In play', 'Result']].map(([v, l]) => (
                          <div key={l}><b style={{ display: 'block', fontSize: 20, fontWeight: 800 }}>{v}</b><span style={{ fontSize: 10, letterSpacing: '.1em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{l}</span></div>
                        ))}
                      </div>
                    )}
                    {pitch && play && pitch.hx != null && (
                      <div style={{ marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 12, padding: 10 }}>
                        <div style={{ ...kick, margin: '0 0 4px' }}>⊕ Where it landed</div>
                        <FieldView key={`${play.id}:${pitchIdx}`} field={game.venue.field} venue={game.venue.name} pitch={pitch}
                          armed={stageDone === play.id || (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)} />
                      </div>
                    )}
                    <div style={{ fontSize: 9.5, color: C.faint, marginTop: 8 }}>Click a pitch to ask what a pitch like it has done. Locations: MLB tracking, catcher&apos;s view.</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── right: when did this last happen ── */}
        <div className="gm-rt">
          <div style={{ ...pad, position: 'sticky', top: 16 }}>
            {play ? <LastTimePanel key={`${play.id}:${pitchIdx}`} game={game} play={play} pitch={pitch} isPro={isPro} /> : (
              <div style={{ fontSize: 13, color: C.mute }}>Select a plate appearance to ask when something like it last happened.</div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 16, fontSize: 12 }}>
        <Link href={`/mlb/stats/games?date=${game.date}`} style={{ color: C.orange, fontWeight: 700, textDecoration: 'none' }}>← All games on this date</Link>
        <a href={`https://www.mlb.com/gameday/${game.gamePk}`} target="_blank" rel="noreferrer" style={{ color: C.mute, textDecoration: 'underline' }}>Gameday ↗</a>
      </div>
    </div>
  )
}
