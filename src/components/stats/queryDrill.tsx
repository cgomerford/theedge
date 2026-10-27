'use client'

// src/components/stats/queryDrill.tsx
//
// Shared by the stats page and the live-situations page: the "open a row and go deeper" pieces —
// lazy fetching from /api/stats/drill, the pitch-level view (strike-zone plot, pitch mix, pitch table),
// plate-appearance and pitch tables for one game, and the "last happened" list.

import { Fragment, useEffect, useState } from 'react'
import { C, SANS, MONO, Card, Tile, Empty, headshot } from '@/components/team/ui'
import { th, td, tdName } from '@/components/stats/queryUi'
import type { RecentHit } from '@/lib/stats-query'
import type { DrillDetail, PitchLite } from '@/lib/stats-drill'
import { deepGroupLabel, type Group } from '@/lib/stats-query-catalog'

/** ▸ / ▾ button for a table row that has a club breakdown. */
export function ExpandBtn({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-expanded={open} aria-label={open ? 'Hide clubs' : 'Show clubs'} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ all: 'unset', cursor: 'pointer', width: 18, color: C.orange, fontSize: 11, display: 'inline-block' }}>{open ? '▾' : '▸'}</button>
  )
}


// ── drill-down: club → players → games → plate appearances / pitches ────

export type DrillQs = { group: Group; gameType: string; from: number; to: number; split: string }

export function drillUrl(level: string, qs: DrillQs, extra: Record<string, string | number>): string {
  const p = new URLSearchParams({ level, group: qs.group, gameType: qs.gameType, from: String(qs.from), to: String(qs.to) })
  if (qs.split) p.set('split', qs.split)
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v))
  return `/api/stats/drill?${p.toString()}`
}

/** Fetches once when `url` changes. */
export function useDrill<T>(url: string | null): { loading: boolean; error: string | null; data: T | null } {
  const [st, setSt] = useState<{ loading: boolean; error: string | null; data: T | null }>({ loading: !!url, error: null, data: null })
  useEffect(() => {
    if (!url) return
    let cancelled = false
    setSt({ loading: true, error: null, data: null })
    fetch(url).then(async r => {
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `Request failed (${r.status})`)
      if (!cancelled) setSt({ loading: false, error: null, data: j as T })
    }).catch(e => { if (!cancelled) setSt({ loading: false, error: (e as Error).message, data: null }) })
    return () => { cancelled = true }
  }, [url])
  return st
}

export function Avatar({ id, name, size = 26 }: { id: number; name: string; size?: number }) {
  const [bad, setBad] = useState(false)
  if (bad) {
    return <span aria-hidden style={{ width: size, height: size, borderRadius: 999, background: C.soft, color: C.mute, fontSize: size * 0.4, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {name.split(' ').map(w => w[0]).join('').slice(0, 2)}
    </span>
  }
  // eslint-disable-next-line @next/next/no-img-element -- external CDN headshot, size varies by context
  return <img src={headshot(id, 80)} alt="" width={size} height={size} onError={() => setBad(true)}
    style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover', background: C.soft, flexShrink: 0 }} />
}

/** "102.3 mph" (+ launch angle and distance when known) for a ball in play. */
export const evText = (ev: number | null | undefined, la?: number | null, dist?: number | null): string =>
  ev == null ? '' : `${ev.toFixed(1)} mph${la != null ? ` · ${Math.round(la)}°` : ''}${dist ? ` · ${Math.round(dist)} ft` : ''}`

export const subHead: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', fontFamily: SANS, fontSize: 10, color: C.faint, fontWeight: 600, whiteSpace: 'nowrap' }
export const subCell: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', fontFamily: SANS, fontSize: 12, color: C.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

/** A message row spanning the whole table (loading / error / empty). */
export function NoteRow({ span, children }: { span: number; children: React.ReactNode }) {
  return <tr style={{ background: '#faf8f3' }}><td colSpan={span} style={{ padding: '8px 12px 8px 40px', fontFamily: SANS, fontSize: 12, color: C.faint }}>{children}</td></tr>
}

// ── pitch-level detail ──────────────────────────────────────────────────

const CALL_COLOR: Record<PitchLite['kind'], string> = { ball: '#4C7EF3', strike: '#D4533B', foul: '#a89e8c', inplay: '#1D9E75', other: '#c9c2b0' }
const CALL_LABEL: Record<PitchLite['kind'], string> = { ball: 'Ball', strike: 'Strike', foul: 'Foul', inplay: 'In play', other: 'Other' }
const FASTBALLS = /fastball|sinker|cutter/i

/** Where each pitch crossed the plate (catcher's view), numbered in order, coloured by how it was called. */
export function ZonePlot({ pitches, size = 150 }: { pitches: PitchLite[]; size?: number }) {
  const pts = pitches.filter(p => p.px != null && p.pz != null)
  if (!pts.length) return null
  const avg = (xs: (number | null)[], d: number) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : d }
  const top = avg(pts.map(p => p.szTop), 3.5), bot = avg(pts.map(p => p.szBot), 1.6)
  const W = size, H = Math.round(size * 1.15), sx = W / 4, sz = H / 4      // window: x ±2 ft, z 0.5–4.5 ft
  const X = (px: number) => W / 2 + px * sx
  const Y = (pz: number) => H - (pz - 0.5) * sz
  const small = pts.length > 14
  return (
    <svg width={W} height={H + 18} viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Pitch locations" style={{ flexShrink: 0, background: '#fff', border: `1px solid ${C.soft}`, borderRadius: 6 }}>
      <rect x={X(-0.83)} y={Y(top)} width={1.66 * sx} height={(top - bot) * sz} fill="none" stroke={C.mute} strokeWidth={1.2} />
      {[1, 2].map(i => <line key={`v${i}`} x1={X(-0.83) + (i * 1.66 * sx) / 3} x2={X(-0.83) + (i * 1.66 * sx) / 3} y1={Y(top)} y2={Y(bot)} stroke={C.line} strokeWidth={0.8} />)}
      {[1, 2].map(i => <line key={`h${i}`} y1={Y(top) + (i * (top - bot) * sz) / 3} y2={Y(top) + (i * (top - bot) * sz) / 3} x1={X(-0.83)} x2={X(0.83)} stroke={C.line} strokeWidth={0.8} />)}
      <path d={`M ${X(-0.7)} ${H - 3} L ${X(0.7)} ${H - 3} L ${X(0.7)} ${H - 8} L ${X(0)} ${H - 12} L ${X(-0.7)} ${H - 8} Z`} fill="#f1eee6" stroke={C.line} />
      {pts.map(p => (
        <g key={p.no}>
          <circle cx={X(p.px as number)} cy={Y(p.pz as number)} r={small ? 4.5 : 7.5} fill={CALL_COLOR[p.kind]} fillOpacity={0.9} stroke="#fff" strokeWidth={1} />
          {!small && <text x={X(p.px as number)} y={Y(p.pz as number) + 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: 800, fill: '#fff' }}>{p.no}</text>}
        </g>
      ))}
      {(Object.keys(CALL_COLOR) as PitchLite['kind'][]).filter(k => k !== 'other').map((k, i) => (
        <g key={k} transform={`translate(${6 + i * (W / 4)}, ${H + 10})`}>
          <circle r={3.5} fill={CALL_COLOR[k]} />
          <text x={7} y={3} style={{ fontSize: 8.5, fill: C.mute }}>{CALL_LABEL[k]}</text>
        </g>
      ))}
    </svg>
  )
}

/** Every pitch in order: type, velocity, spin, zone, call and the count it left. */
export function PitchTable({ pitches }: { pitches: PitchLite[] }) {
  const anyEv = pitches.some(p => p.ev != null)
  return (
    <table style={{ borderCollapse: 'collapse', minWidth: 360 }}>
      <thead><tr>{['#', 'Pitch', 'Velo', 'Spin', 'Zone', 'Call', 'Count', ...(anyEv ? ['Exit velo'] : [])].map(h => <th key={h} style={subHead}>{h}</th>)}</tr></thead>
      <tbody>
        {pitches.map(p => (
          <tr key={p.no} style={{ borderTop: `1px solid ${C.soft}` }}>
            <td style={subCell}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: CALL_COLOR[p.kind], marginRight: 6 }} />{p.no}</td>
            <td style={subCell}>{p.type}</td>
            <td style={subCell}>{p.speed != null ? p.speed.toFixed(1) : '—'}</td>
            <td style={subCell}>{p.spin != null ? Math.round(p.spin) : '—'}</td>
            <td style={subCell}>{p.zone ?? '—'}</td>
            <td style={subCell}>{p.call}</td>
            <td style={subCell}>{p.count}</td>
            {anyEv && <td style={{ ...subCell, fontWeight: 800 }}>{evText(p.ev, p.la, p.dist)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Pitch types used (count, share, average / top velocity) — the "fastball %" of an outing or an at-bat. */
export function PitchMix({ pitches }: { pitches: PitchLite[] }) {
  const by = new Map<string, PitchLite[]>()
  for (const p of pitches) by.set(p.type, [...(by.get(p.type) ?? []), p])
  const rows = [...by.entries()].map(([type, list]) => {
    const v = list.map(x => x.speed).filter((x): x is number => x != null)
    return { type, n: list.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, max: v.length ? Math.max(...v) : null }
  }).sort((a, b) => b.n - a.n)
  const fb = pitches.filter(p => FASTBALLS.test(p.type)).length
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: C.orange, marginBottom: 4 }}>
        Pitch mix · fastballs {pitches.length ? Math.round((fb / pitches.length) * 100) : 0}%
      </div>
      {rows.map(r => (
        <div key={r.type} style={{ display: 'grid', gridTemplateColumns: '1fr 34px 44px 50px', gap: 6, fontFamily: SANS, fontSize: 12, padding: '2px 0', borderTop: `1px solid ${C.soft}` }}>
          <span>{r.type}</span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.n}</span>
          <span style={{ textAlign: 'right', color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{Math.round((r.n / pitches.length) * 100)}%</span>
          <span style={{ textAlign: 'right', color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{r.avg != null ? `${r.avg.toFixed(1)}` : '—'}{r.max != null ? <span style={{ color: C.faint }}> /{r.max.toFixed(0)}</span> : null}</span>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, marginTop: 4 }}>count · share · avg / top mph</div>
    </div>
  )
}

/** The pitch-by-pitch view of ONE plate appearance: strike-zone plot, mix and the full table. */
export function PitchSeq({ pitches }: { pitches: PitchLite[] }) {
  if (!pitches.length) return <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, padding: 8 }}>No pitch data was recorded for this plate appearance.</div>
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', padding: '8px 4px' }}>
      <ZonePlot pitches={pitches} />
      <div style={{ overflowX: 'auto' }}><PitchTable pitches={pitches} /></div>
      <PitchMix pitches={pitches} />
    </div>
  )
}

/** Last level: every plate appearance (batter, each opening into its pitches) or every pitch (pitcher) from one game. */
export function GameDetailRow({ gamePk, playerId, group, span, atBat }: { gamePk: number; playerId: number; group: Group; span: number; atBat?: number }) {
  const [openPA, setOpenPA] = useState<number[] | null>(null)
  const extra = atBat ? `&atBat=${atBat}` : ''
  const { loading, error, data } = useDrill<DrillDetail>(`/api/stats/drill?level=game-detail&group=${group}&gamePk=${gamePk}&playerId=${playerId}${extra}`)
  if (loading) return <NoteRow span={span}>Loading the play-by-play…</NoteRow>
  if (error) return <NoteRow span={span}>{error}</NoteRow>
  if (!data || data.kind === 'none' || !data.rows.length) return <NoteRow span={span}>No play-by-play for this player in this game.</NoteRow>

  if (data.kind === 'pa') {
    // a single requested plate appearance opens straight to its pitches
    const open = openPA ?? (atBat ? data.rows.map(r => r.atBat) : [])
    return (
      <tr style={{ background: '#fff' }}>
        <td colSpan={span} style={{ padding: '6px 12px 10px 48px' }}>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.soft}`, borderRadius: 6 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{['', 'Inn', 'Against', 'Count', 'Pitches', 'Result', 'Exit velo', 'Play'].map((h, i) => <th key={i} style={subHead}>{h}</th>)}</tr></thead>
              <tbody>
                {data.rows.map(r => {
                  const isOpen = open.includes(r.atBat)
                  return (
                    <Fragment key={r.atBat}>
                      <tr style={{ borderTop: `1px solid ${C.soft}` }}>
                        <td style={subCell}><ExpandBtn open={isOpen} onClick={() => setOpenPA(isOpen ? open.filter(x => x !== r.atBat) : [...open, r.atBat])} /></td>
                        <td style={subCell}>{r.half === 'Top' ? '▲' : '▼'} {r.inning}</td>
                        <td style={subCell}>{r.pitcher}</td>
                        <td style={subCell}>{r.count}</td>
                        <td style={subCell}>{r.pitches}</td>
                        <td style={{ ...subCell, fontWeight: 800 }}>{r.event}</td>
                        <td style={{ ...subCell, fontWeight: 700 }}>{evText(r.ev, r.la, r.dist) || '—'}</td>
                        <td style={{ ...subCell, color: C.mute, whiteSpace: 'normal', minWidth: 240 }}>{r.description}</td>
                      </tr>
                      {isOpen && <tr><td colSpan={8} style={{ background: '#faf8f3', padding: '4px 10px' }}><PitchSeq pitches={r.pitchList} /></td></tr>}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    )
  }

  const all: PitchLite[] = data.rows
  return (
    <tr style={{ background: '#fff' }}>
      <td colSpan={span} style={{ padding: '8px 12px 12px 48px' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
          <ZonePlot pitches={all} size={170} />
          <PitchMix pitches={all} />
        </div>
        <div style={{ overflowX: 'auto', border: `1px solid ${C.soft}`, borderRadius: 6 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>{['Inn', 'Batter', '#', 'Pitch', 'Velo', 'Spin', 'Zone', 'Call', 'Count', 'Exit velo', 'PA result'].map(h => <th key={h} style={subHead}>{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.soft}`, background: r.result ? '#fff1ec' : undefined }}>
                  <td style={subCell}>{r.half === 'Top' ? '▲' : '▼'} {r.inning}</td>
                  <td style={subCell}>{r.no === 1 ? r.batter : ''}</td>
                  <td style={subCell}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: CALL_COLOR[r.kind], marginRight: 5 }} />{r.no}</td>
                  <td style={subCell}>{r.type}</td>
                  <td style={subCell}>{r.speed != null ? `${r.speed.toFixed(1)} mph` : '—'}</td>
                  <td style={subCell}>{r.spin != null ? Math.round(r.spin) : '—'}</td>
                  <td style={subCell}>{r.zone ?? '—'}</td>
                  <td style={subCell}>{r.call}</td>
                  <td style={subCell}>{r.count}</td>
                  <td style={{ ...subCell, fontWeight: 700 }}>{evText(r.ev, r.la, r.dist)}</td>
                  <td style={{ ...subCell, fontWeight: 800 }}>{r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}


export function RecentList({ rows, total, deep, onFindSimilar, hitRef }: {
  rows: RecentHit[]; total?: number; deep: boolean
  /** shown on rows with a measured batted ball: "Find hits like this" */
  onFindSimilar?: (r: RecentHit) => void
  /** the hit being matched, so each result can show how far off it is */
  hitRef?: { ev: number; la: number | null; dist: number | null }
}) {
  const [open, setOpen] = useState<string[]>([])
  if (!rows.length) {
    return <Empty>This situation hasn&apos;t come up in the selected seasons. Widen the season range in Scope to look further back.</Empty>
  }
  const last = rows[0]
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(`${last.date}T12:00:00`)) / 86400_000))
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  const nice = (d: string) => { const [y, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}/${y.slice(2)}` }
  const span = 12 + (hitRef ? 1 : 0) + (onFindSimilar ? 1 : 0)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="ql-tiles">
        <Tile label="Last time it happened" value={nice(last.date)} sub={when} />
        <Tile label="Where" value={`${last.awayTeam} @ ${last.homeTeam}`} sub={`${last.half === 'Top' ? 'Top' : 'Bottom'} ${last.inning}`} />
        <Tile label="Who" value={last.batter} sub={`vs ${last.pitcher}`} />
        <Tile label="Times in range" value={(total ?? rows.length).toLocaleString()} sub={`showing the latest ${rows.length}`} />
      </div>
      <Card title="Most recent times this happened" note="Newest first. Open a row (▸) to see every pitch of that plate appearance, or jump straight to the game.">
        <div className="ql-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Date</th>
                <th style={{ ...th, textAlign: 'left' }}>Game</th>
                <th style={th}>Inn</th><th style={th}>Outs</th>
                <th style={{ ...th, textAlign: 'left' }}>On base</th>
                <th style={{ ...th, textAlign: 'left' }}>Score</th>
                <th style={{ ...th, textAlign: 'left' }}>Batter</th>
                <th style={{ ...th, textAlign: 'left' }}>Pitcher</th>
                <th style={th}>P</th>
                <th style={{ ...th, textAlign: 'left' }}>Result</th>
                <th style={th}>Exit velo</th>
                <th style={th}>Angle</th>
                <th style={th}>Dist</th>
                {hitRef && <th style={th} title="How far each hit is from the one you are matching">Off by</th>}
                {onFindSimilar && <th style={th} />}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const k = `${r.gamePk}-${r.atBat}`
                const isOpen = open.includes(k)
                return (
                  <Fragment key={k}>
                    <tr style={{ borderBottom: `1px solid ${C.soft}` }}>
                      <td style={{ ...tdName, fontWeight: 700 }}>
                        <ExpandBtn open={isOpen} onClick={() => setOpen(o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))} />
                        {nice(r.date)}
                      </td>
                      <td style={tdName}>
                        {r.awayTeam} @ {r.homeTeam}
                        <a href={`https://www.mlb.com/gameday/${r.gamePk}`} target="_blank" rel="noreferrer" title="Open in Gameday" style={{ marginLeft: 6, color: C.orange, textDecoration: 'none', fontSize: 11 }}>↗</a>
                      </td>
                      <td style={td}>{r.half === 'Top' ? '▲' : '▼'} {r.inning}</td>
                      <td style={td}>{r.outs}</td>
                      <td style={{ ...td, textAlign: 'left' }}>{deepGroupLabel('base_state', String(r.baseState))}</td>
                      <td style={{ ...td, textAlign: 'left' }}>{r.battingTeam} {deepGroupLabel('score_diff', String(r.scoreDiff)).toLowerCase()}</td>
                      <td style={tdName}>{r.batter}</td>
                      <td style={tdName}>{r.pitcher}</td>
                      <td style={td}>{r.pitches}</td>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>{deepGroupLabel('events', r.event)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.ev != null ? `${r.ev.toFixed(1)} mph` : '—'}</td>
                      <td style={td}>{r.la != null ? `${Math.round(r.la)}°` : '—'}</td>
                      <td style={td}>{r.dist ? `${Math.round(r.dist)} ft` : '—'}</td>
                      {hitRef && (
                        <td style={{ ...td, color: C.mute }}>
                          {r.ev != null ? `${Math.abs(r.ev - hitRef.ev).toFixed(1)} mph` : '—'}
                          {hitRef.la != null && r.la != null ? ` · ${Math.abs(Math.round(r.la - hitRef.la))}°` : ''}
                          {hitRef.dist && r.dist ? ` · ${Math.abs(Math.round(r.dist - hitRef.dist))} ft` : ''}
                        </td>
                      )}
                      {onFindSimilar && (
                        <td style={td}>
                          {r.ev != null && (
                            <button type="button" onClick={() => onFindSimilar(r)} title="Find other hits like this one"
                              style={{ fontFamily: SANS, fontWeight: 700, fontSize: 11.5, padding: '3px 8px', whiteSpace: 'nowrap', borderRadius: 4, border: `1px solid ${C.orange}`, background: '#fff', color: C.orange, cursor: 'pointer' }}>
                              Similar hits
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {isOpen && <GameDetailRow gamePk={r.gamePk} playerId={r.batterId} group="hitting" span={span} atBat={r.atBat} />}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginTop: 10 }}>
          {deep ? 'Built from every plate appearance in the selected seasons.' : 'A single situation is checked against every plate appearance in the selected seasons.'}
        </div>
      </Card>
    </div>
  )
}

