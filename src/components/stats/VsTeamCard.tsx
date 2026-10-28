'use client'

// A player's career record against one club (the answer to "Juan Soto vs Yankees"): one row with the headshot, then season by season.
import { useEffect, useState } from 'react'
import { C, SANS, Card, Empty, teamLogo, headshot } from '@/components/team/ui'

export type VsReq = { playerId: number; team: string; role: 'bat' | 'pitch' }
type Stat = Record<string, string | number | undefined>
type Out = { player: { id: number; name: string; pos: string }; team: { id: number; name: string; abbrev: string }; group: 'hitting' | 'pitching'; total: Stat | null; seasons: { season: string; stat: Stat }[]; lookupsLeft?: number | null; perDay?: number | null }

const HIT: { k: string; l: string }[] = [
  { k: 'gamesPlayed', l: 'GP' }, { k: 'plateAppearances', l: 'PA' }, { k: 'atBats', l: 'AB' }, { k: 'hits', l: 'H' }, { k: 'avg', l: 'AVG' }, { k: 'obp', l: 'OBP' }, { k: 'slg', l: 'SLG' },
  { k: 'ops', l: 'OPS' }, { k: 'homeRuns', l: 'HR' }, { k: 'rbi', l: 'RBI' }, { k: 'baseOnBalls', l: 'BB' }, { k: 'strikeOuts', l: 'K' },
]
const PIT: { k: string; l: string }[] = [
  { k: 'gamesPlayed', l: 'G' }, { k: 'gamesStarted', l: 'GS' }, { k: 'inningsPitched', l: 'IP' }, { k: 'wins', l: 'W' }, { k: 'losses', l: 'L' }, { k: 'era', l: 'ERA' }, { k: 'whip', l: 'WHIP' },
  { k: 'strikeOuts', l: 'K' }, { k: 'baseOnBalls', l: 'BB' }, { k: 'homeRuns', l: 'HR' }, { k: 'avg', l: 'AVG against' },
]

export default function VsTeamCard({ req, onLookups }: { req: VsReq; onLookups: (left: number | null, perDay: number | null, limited: boolean) => void }) {
  const [out, setOut] = useState<Out | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    setBusy(true); setErr(null)
    fetch(`/api/stats/vs-team?playerId=${req.playerId}&team=${req.team}&group=${req.role === 'pitch' ? 'pitching' : 'hitting'}`)
      .then(async r => {
        const j = await r.json()
        if (!live) return
        if (r.status === 429 && j.limit) { onLookups(0, j.perDay ?? null, true); return }
        if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`)
        setOut(j as Out)
        if (typeof j.lookupsLeft === 'number') onLookups(j.lookupsLeft, j.perDay ?? null, false)
      })
      .catch(e => { if (live) { console.error('[VsTeamCard]', e); setErr((e as Error).message) } })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [req.playerId, req.team, req.role]) // eslint-disable-line react-hooks/exhaustive-deps

  if (busy && !out) return <Card title="Player against a club"><Empty>Loading the record…</Empty></Card>
  if (err) return <Card title="Player against a club"><Empty>{err}</Empty></Card>
  if (!out) return null
  const cols = out.group === 'pitching' ? PIT : HIT
  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: C.mute, fontWeight: 800, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '8px', fontVariantNumeric: 'tabular-nums', fontWeight: 700, whiteSpace: 'nowrap' }
  const cell = (s: Stat, k: string) => (s[k] == null ? '–' : String(s[k]))
  return (
    <Card title={`${out.player.name} against the ${out.team.name}`} note={out.group === 'pitching' ? 'career, as the pitcher' : 'career, as the batter'}>
      {!out.total ? <Empty>No recorded {out.group === 'pitching' ? 'appearances against' : 'plate appearances against'} this club.</Empty> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontFamily: SANS, fontSize: 15 }}>
            <thead><tr><th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Player</th>{cols.map(c => <th key={c.k} style={th}>{c.l}</th>)}</tr></thead>
            <tbody>
              <tr style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: '8px', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#fff', zIndex: 1, minWidth: 200 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={headshot(out.player.id, 80)} alt="" width={40} height={40} style={{ borderRadius: 20, background: C.soft, objectFit: 'cover' }} />
                    {out.player.name}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={teamLogo(out.team.id)} alt="" width={22} height={22} />
                  </span>
                </td>
                {cols.map(c => <td key={c.k} style={td}>{cell(out.total as Stat, c.k)}</td>)}
              </tr>
              {open ? out.seasons.map(s => (
                <tr key={s.season} style={{ borderTop: `1px solid ${C.line}`, color: '#5b5347' }}>
                  <td style={{ padding: '8px 8px 8px 58px', fontWeight: 700, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{s.season}</td>
                  {cols.map(c => <td key={c.k} style={td}>{cell(s.stat, c.k)}</td>)}
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>
      )}
      {out.total && out.seasons.length ? (
        <button type="button" onClick={() => setOpen(o => !o)} style={{ marginTop: 8, background: 'none', border: 0, borderBottom: '3px solid #FF5722', padding: '2px 0', fontWeight: 800, cursor: 'pointer', font: 'inherit' }}>{open ? 'Hide seasons' : 'Show season by season'}</button>
      ) : null}
    </Card>
  )
}
