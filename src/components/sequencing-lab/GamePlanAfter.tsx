'use client'

// src/components/sequencing-lab/GamePlanAfter.tsx
//
// Game Plan Card → After the game: card vs what was thrown. For each hitter in the card's lineup, the card's line on the left and what the starter actually threw to him on the right:
// the first pitch (swung at or taken), the first two pitches against the card's opener, the two-strike pitches against the card's two-strike pitch, and how each plate appearance ended.
// The pitches come from /api/game-plan/after (that game's stored pitches, which load the morning after). Counts only: "matched" means the same pitch types in the same order; nothing here
// scores the card, and it describes what happened in one game, not what will happen in another.

import { useEffect, useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import { zoneLabel } from '@/lib/game-plan/zones'
import type { Card, CardHitter } from '@/lib/game-plan/data'
import type { AfterPa, AfterPitch } from '@/app/api/game-plan/after/route'
import PitchDot from './PitchDot'
import { kick, note, tile } from './ui'

const WHIFFS = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt'])
const FOULS = new Set(['foul', 'foul_bunt', 'bunt_foul_tip'])
const swung = (d: string | null) => !!d && (WHIFFS.has(d) || FOULS.has(d) || d.startsWith('hit_into_play'))
const EVENT: Record<string, string> = { strikeout: 'Strikeout', walk: 'Walk', intent_walk: 'Walk', hit_by_pitch: 'Hit by pitch', single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', field_out: 'Out in play', force_out: 'Out in play', grounded_into_double_play: 'Double play', double_play: 'Double play', sac_fly: 'Sac fly', sac_bunt: 'Sac bunt', fielders_choice: "Fielder's choice", field_error: 'Reached on error', truncated_pa: 'Plate appearance cut short', catcher_interf: 'Catcher interference' }
const TH: React.CSSProperties = { padding: '9px 14px', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint, fontWeight: 800, textAlign: 'left', background: '#f1eee6' }

type Load = 'idle' | 'loading' | 'error' | { pas: AfterPa[] }

const dots = (ps: AfterPitch[], stand: 'L' | 'R' | null) => (
  <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
    {ps.map((p, i) => p.t ? <PitchDot key={i} t={p.t} size={20} ring={!!p.desc && WHIFFS.has(p.desc)} title={`${pitchLabel(p.t)}${zoneLabel(p.z, stand) ? `, ${zoneLabel(p.z, stand)}` : ''}${p.desc ? `, ${p.desc.replace(/_/g, ' ')}` : ''}`} /> : null)}
  </span>
)

export default function GamePlanAfter({ card, active }: { card: Card; active: boolean }) {
  const [load, setLoad] = useState<Load>('idle')
  useEffect(() => {
    if (!active || load !== 'idle') return
    setLoad('loading')
    fetch(`/api/game-plan/after?gamePk=${card.meta.gamePk}&pitcherId=${card.starter.id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { pas: AfterPa[] }) => setLoad({ pas: j.pas ?? [] }))
      .catch(() => setLoad('error'))
  }, [active, load, card.meta.gamePk, card.starter.id])

  if (load === 'idle' || load === 'loading') return <div style={tile}><p style={{ ...note, margin: 0 }}>Reading what {card.starter.name} threw…</p></div>
  if (load === 'error') return <div style={tile}><p style={{ ...note, margin: 0 }}>The pitches for this game could not be loaded right now.</p></div>
  const pas = load.pas
  if (pas.length === 0) return (
    <div style={{ ...tile, borderStyle: 'dashed' }}>
      <div style={kick}>After the game</div>
      <p style={note}>No pitches are stored for {card.starter.name} in this game yet. A game&apos;s pitches load the morning after it is played, so check back then.</p>
    </div>
  )

  const rows = card.hitters.map((h: CardHitter) => {
    const mine = pas.filter(p => p.batterId === h.id)
    const stand = h.bats ?? mine[0]?.stand ?? null
    const firstPitches = mine.map(p => p.pitches[0]).filter(Boolean)
    const twoK = mine.flatMap(p => p.pitches.filter(x => x.strikes === 2))
    const openerMatched = h.opener ? mine.filter(p => p.pitches.length >= 2 && p.pitches[0].t === h.opener!.pitches[0] && p.pitches[1].t === h.opener!.pitches[1]).length : 0
    const openerFaced = mine.filter(p => p.pitches.length >= 2).length
    return { h, mine, stand, firstPitches, twoK, openerMatched, openerFaced }
  })
  const faced = rows.reduce((s, r) => s + r.mine.length, 0)
  const om = rows.reduce((s, r) => s + r.openerMatched, 0), of = rows.reduce((s, r) => s + r.openerFaced, 0)
  const twoTotal = rows.reduce((s, r) => s + r.twoK.length, 0)
  const twoCard = rows.reduce((s, r) => s + (r.h.two_strikes ? r.twoK.filter(p => p.t === r.h.two_strikes!.type).length : 0), 0)
  const fpSwung = rows.reduce((s, r) => s + r.firstPitches.filter(p => swung(p.desc)).length, 0), fpTotal = rows.reduce((s, r) => s + r.firstPitches.length, 0)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
        {[[`${faced}`, 'plate appearances against the card\'s lineup'], [`${om} of ${of}`, 'opened with the card\'s two pitches, in order'], [`${twoCard} of ${twoTotal}`, 'two-strike pitches were the card\'s pitch'], [`${fpSwung} of ${fpTotal}`, 'first pitches were swung at']].map(([v, l]) => (
          <div key={l} style={tile}><div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{v}</div><div style={{ fontSize: 12, color: C.mute, lineHeight: 1.4 }}>{l}</div></div>
        ))}
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 14, background: '#fff' }}>
        <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>
          <thead><tr><th style={TH}>Hitter</th><th style={TH}>First pitch<br /><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>card · thrown</span></th><th style={TH}>Opener<br /><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>card · thrown</span></th><th style={TH}>Two strikes<br /><span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>card · thrown</span></th><th style={TH}>How it ended</th></tr></thead>
          <tbody>
            {rows.map(({ h, mine, stand, firstPitches, twoK, openerMatched, openerFaced }) => (
              <tr key={h.id} style={{ borderTop: `1px solid ${C.soft}`, verticalAlign: 'top' }}>
                <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}><span style={{ fontSize: 20, fontWeight: 800, marginRight: 8 }}>{h.slot}</span><b style={{ fontSize: 14 }}>{h.name}</b><div style={{ fontSize: 11.5, color: C.mute, marginLeft: 22 }}>{mine.length ? `${mine.length} plate appearance${mine.length === 1 ? '' : 's'}` : 'Did not face him'}</div></td>
                <td style={{ padding: '12px 14px', fontSize: 12.5 }}>
                  <div>{h.first_pitch.value != null ? `Card: swings ${Math.round(h.first_pitch.value)}%` : 'Card: small sample'}</div>
                  {firstPitches.length > 0 ? <div style={{ marginTop: 4, display: 'grid', gap: 3 }}>{firstPitches.map((p, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{p.t && <PitchDot t={p.t} size={18} />}<span>{zoneLabel(p.z, stand) ?? ''} · <b>{swung(p.desc) ? 'swung' : 'took'}</b></span></div>)}</div> : <div style={{ color: C.faint, marginTop: 4 }}>—</div>}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12.5 }}>
                  {h.opener ? <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Card: <PitchDot t={h.opener.pitches[0]} size={18} />→<PitchDot t={h.opener.pitches[1]} size={18} /></div> : <div>Card: no opener sample</div>}
                  {mine.length > 0 ? <div style={{ marginTop: 4, display: 'grid', gap: 4 }}>{mine.map(p => <div key={p.ab} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{dots(p.pitches.slice(0, 2), stand)}</div>)}{h.opener && <div style={{ fontWeight: 800, color: openerMatched ? C.ink : C.mute }}>{openerMatched} of {openerFaced} matched</div>}</div> : <div style={{ color: C.faint, marginTop: 4 }}>—</div>}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12.5 }}>
                  {h.two_strikes ? <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>Card: <PitchDot t={h.two_strikes.type} size={18} />{h.two_strikes.zone ?? ''}</div> : <div>Card: no two-strike sample</div>}
                  {twoK.length > 0 ? <div style={{ marginTop: 4 }}>{dots(twoK, stand)}{h.two_strikes && <div style={{ fontWeight: 800, marginTop: 3 }}>{twoK.filter(p => p.t === h.two_strikes!.type).length} of {twoK.length} were the card&apos;s pitch</div>}</div> : <div style={{ color: C.faint, marginTop: 4 }}>{mine.length ? 'No two-strike pitches' : '—'}</div>}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12.5, fontWeight: 800 }}>{mine.length ? mine.map(p => <div key={p.ab}>{p.event ? EVENT[p.event] ?? p.event.replace(/_/g, ' ') : 'No result stored'}</div>) : <span style={{ color: C.faint, fontWeight: 600 }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ ...note, margin: 0 }}>What {card.starter.name} threw to each hitter in this game, next to the card&apos;s line. &quot;Matched&quot; means the same two pitch types in the same order. One game is a small sample; this shows what happened that night, not what will happen next time. Ring = swing and miss.</p>
    </div>
  )
}
