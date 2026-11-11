'use client'

// src/components/pitch-shape/DamageAndFip.tsx
//
// "Judged on FIP: did this pitch inflate his ERA?" for one pitcher and one pitch (MLB). Two parts, both descriptive:
//   * FIP beside ERA and xERA, with FIP first. FIP counts only what the pitcher controls most directly (strikeouts, walks, hit batters and home runs), so it leaves out the luck in where balls in play land
//     and when hits come (defense and sequencing). It still counts home runs. The gap between ERA and FIP says how much of his ERA is the part FIP leaves out.
//   * The biggest damage this pitch did: home runs, with the runners on base, and extra-base hits with a runner in scoring position, counted from his per-pitch log. A home run scores one run plus every
//     runner on base, so its runs are exact; the other hits are listed without a run count because the log does not say how many scored. The runs those home runs added to his ERA are worked out over his innings.
// The game, inning and runner detail is Pro (the log withholds it from everyone else), so for a viewer without it the home-run count shows and the list is a prompt. Nothing here predicts anything.

import { useEffect, useState } from 'react'
import { C } from '@/components/team/ui'
import UpgradePrompt from '@/components/pro/UpgradePrompt'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'

const cache = new Map<string, PitcherPitchLog | null>()
const k: React.CSSProperties = { fontSize: 10, letterSpacing: '.12em', fontWeight: 800, color: C.mute, textTransform: 'uppercase' }
const ORANGE_TEXT = '#B83A0E'
const EVENT_WORD: Record<string, string> = { home_run: 'Home run', double: 'Double', triple: 'Triple' }
const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateWord = (d: string) => `${mon[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`
const f2 = (v: number | null) => (v == null ? '—' : v.toFixed(2))

type Hit = { p: RawPitch; event: string; runs: number | null; runners: number }
/** the event a pitch ended the plate appearance with, or null when it did not end one */
const eventOf = (p: RawPitch) => (p.result != null && p.result !== p.description ? p.result : null)

export default function DamageAndFip({ pitcherId, season, pitchType, pitchName, era, fip, xera, ip }: {
  pitcherId: number; season: number; pitchType: string; pitchName: string
  era: number | null; fip: number | null; xera: number | null; ip: number | null
}) {
  const key = `${pitcherId}|${season}`
  const [got, setGot] = useState<{ key: string; v: PitcherPitchLog | null } | null>(null)
  useEffect(() => {
    if (cache.has(key)) return
    let live = true
    fetchLabLog('pitcher', pitcherId, season).then(l => { cache.set(key, l); if (live) setGot({ key, v: l }) })
    return () => { live = false }
  }, [key, pitcherId, season])
  const log = cache.has(key) ? cache.get(key) : got?.key === key ? got.v : undefined
  const lc = pitchName.toLowerCase()

  const gapE = era != null && fip != null ? era - fip : null
  const fipLine = gapE == null ? null
    : gapE >= 0.4 ? `His ERA (${f2(era)}) is ${gapE.toFixed(2)} above his FIP (${f2(fip)}). FIP leaves out the luck in where balls in play land and when hits come, so on FIP he has pitched better than his ERA says.`
    : gapE <= -0.4 ? `His ERA (${f2(era)}) is ${Math.abs(gapE).toFixed(2)} below his FIP (${f2(fip)}). The results have been kinder than the strikeouts, walks and home runs behind them, so on FIP he has pitched worse than his ERA says.`
    : `His ERA (${f2(era)}) and FIP (${f2(fip)}) are close, so luck on balls in play has not moved his ERA much.`

  let body: React.ReactNode
  if (log === undefined) body = <div style={{ fontSize: 13, color: C.mute }}>Counting the damage his {lc}s did…</div>
  else if (log === null) body = <div style={{ fontSize: 13, color: '#5b5347' }}>His pitch-by-pitch log could not be read right now, so the damage this pitch did is not shown.</div>
  else {
    const ended = log.pitches.filter(p => eventOf(p) != null)
    const hrAll = ended.filter(p => eventOf(p) === 'home_run').length
    const mine = ended.filter(p => p.pitchType === pitchType)
    const detail = log.pitches.some(p => p.gamePk != null)   // the log withholds game, inning and runners from a viewer without Pro
    const hits: Hit[] = mine.flatMap((p): Hit[] => {
      const event = eventOf(p) as string
      const runners = (p.onBase.first ? 1 : 0) + (p.onBase.second ? 1 : 0) + (p.onBase.third ? 1 : 0)
      if (event === 'home_run') return [{ p, event, runs: 1 + runners, runners }]
      if ((event === 'double' || event === 'triple') && (p.onBase.second || p.onBase.third)) return [{ p, event, runs: null, runners }]
      return []
    }).sort((a, b) => (b.runs ?? 0) - (a.runs ?? 0) || b.runners - a.runners || b.p.date.localeCompare(a.p.date))
    const hrs = hits.filter(h => h.event === 'home_run')
    const runsOnHr = hrs.reduce((s, h) => s + (h.runs ?? 0), 0)
    const addToEra = detail && ip != null && ip >= 10 ? (runsOnHr * 9) / ip : null
    body = (
      <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
          <div style={{ background: '#FFF1EA', borderRadius: 6, padding: '7px 10px', flex: '1 1 110px' }}><div style={k}>Home runs on his {lc}</div><b style={{ fontSize: 20 }}>{hrs.length}</b><div style={{ fontSize: 11, color: C.mute }}>of {hrAll} he has allowed</div></div>
          <div style={{ background: C.soft, borderRadius: 6, padding: '7px 10px', flex: '1 1 110px' }}><div style={k}>Runs on those</div><b style={{ fontSize: 20 }}>{detail ? runsOnHr : '—'}</b><div style={{ fontSize: 11, color: C.mute }}>{detail ? 'the batter plus runners on' : 'detail is Pro'}</div></div>
          <div style={{ background: C.soft, borderRadius: 6, padding: '7px 10px', flex: '1 1 110px' }}><div style={k}>Added to his ERA</div><b style={{ fontSize: 20 }}>{addToEra == null ? '—' : addToEra.toFixed(2)}</b><div style={{ fontSize: 11, color: C.mute }}>runs per nine, over {ip != null ? `${ip.toFixed(0)} IP` : 'his innings'}</div></div>
        </div>
        {!detail ? (
          <div style={{ background: C.soft, borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, marginBottom: 8 }}>The home-run count is open to everyone. Which games and innings they came in, who hit them and how many runners were on is Pro.</div>
            <UpgradePrompt source="pitch_shape" />
          </div>
        ) : hits.length === 0 ? (
          <div style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5 }}>His {lc} has not given up a home run or an extra-base hit with a runner in scoring position this season, so it is not what is lifting his ERA.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 0 }}>
              {hits.slice(0, 6).map(h => (
                <div key={`${h.p.gamePk}-${h.p.atBatNumber}`} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) auto', gap: '2px 12px', alignItems: 'baseline', padding: '8px 0', borderTop: `1px solid ${C.line}`, fontSize: 13.5 }}>
                  <span style={{ color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{dateWord(h.p.date)}</span>
                  <span><b>{EVENT_WORD[h.event] ?? h.event}</b> by {h.p.batterId != null ? log.batterNames[h.p.batterId] ?? 'a hitter' : 'a hitter'}{h.p.inning != null ? ` · inning ${h.p.inning}` : ''}{h.p.balls != null && h.p.strikes != null ? ` · ${h.p.balls}-${h.p.strikes} count` : ''}{h.p.velo != null ? ` · ${h.p.velo.toFixed(1)} mph` : ''}</span>
                  <span style={{ fontWeight: 800, color: h.runs != null && h.runs >= 2 ? '#A8391F' : '#3a352c' }}>{h.runs != null ? `${h.runs} run${h.runs === 1 ? '' : 's'}` : `runner${h.runners === 1 ? '' : 's'} on`}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>Home runs are counted as the batter plus every runner on base. Doubles and triples with a runner in scoring position are listed without a run count, because the log does not say how many scored.</div>
          </>
        )}
        {addToEra != null && addToEra >= 0.15 && <p style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, margin: '10px 0 0', background: C.soft, borderRadius: 4, padding: '8px 10px' }}>The home runs on his {lc} alone put {runsOnHr} run{runsOnHr === 1 ? '' : 's'} on his line, about {addToEra.toFixed(2)} runs per nine. {gapE != null && gapE >= 0.4 ? 'FIP counts home runs too, so that part is in his FIP as well; the rest of the gap between his ERA and FIP is balls in play and sequencing.' : 'FIP counts every home run too, so it does not take this off.'}</p>}
      </>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ background: '#FFF1EA', borderRadius: 6, padding: '7px 10px', flex: '1 1 110px', border: `1px solid #f3dccf` }}><div style={{ ...k, color: ORANGE_TEXT }}>FIP</div><b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{f2(fip)}</b><div style={{ fontSize: 11, color: C.mute }}>what we judge him on</div></div>
        <div style={{ background: C.soft, borderRadius: 6, padding: '7px 10px', flex: '1 1 110px' }}><div style={k}>ERA</div><b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{f2(era)}</b><div style={{ fontSize: 11, color: C.mute }}>runs per nine</div></div>
        <div style={{ background: C.soft, borderRadius: 6, padding: '7px 10px', flex: '1 1 110px' }}><div style={k}>xERA</div><b style={{ fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{f2(xera)}</b><div style={{ fontSize: 11, color: C.mute }}>from contact quality</div></div>
      </div>
      {fipLine && <p style={{ fontSize: 13.5, color: '#3a352c', lineHeight: 1.5, margin: '8px 0 0' }}>{fipLine}</p>}
      <div style={{ ...k, color: ORANGE_TEXT, margin: '14px 0 0' }}>Where his {lc} did the most damage</div>
      {body}
    </div>
  )
}
