'use client'

// src/components/stats/queryHelp.tsx
//
// The help bar on the right of Ask the Stats: how the page works, how to dig up rare stats by
// typing a question, and which words it understands. Every example is clickable and runs as a
// real search, so the help doubles as a menu of things to try.

import { useState } from 'react'
import { C, SANS, MONO } from '@/components/team/ui'
import { ProBadge } from '@/components/profile/ProPanel'

type Example = { text: string; pro?: boolean; note?: string }

const RARE: Example[] = [
  { text: 'postseason batting average after the 6th inning' },
  { text: 'home runs on 0-2 counts' },
  { text: 'stolen bases in the 9th inning postseason' },
  { text: 'ERA with the bases loaded' },
  { text: '2025 vs 2023 postseason OPS' },
  { text: 'when was the last 8+ pitch at-bat with the bases loaded', pro: true },
  { text: 'last time a grand slam with two outs', pro: true },
  { text: '16+ pitch at-bats after the 6th inning with runners in scoring position', pro: true },
  { text: 'ERA when trailing by 1-3 with runners in scoring position', pro: true },
  { text: 'strikeout rate vs lefties in extra innings', pro: true },
]

const WORDS: { label: string; says: string }[] = [
  { label: 'When', says: 'postseason · world series · wild card · regular season · 2023 · since 2015 · last 5 seasons · 2025 vs 2023' },
  { label: 'Inning', says: 'after the 6th inning · 9th inning · extra innings · late innings · first inning' },
  { label: 'Count', says: 'full count · two strikes · first pitch · ahead / behind in the count · 0-2 count' },
  { label: 'Outs & runners', says: 'two outs · bases loaded · runners in scoring position · bases empty · runners on' },
  { label: 'Score', says: 'when leading · when trailing · tied game · late and close · trailing by 1-3 (Pro)' },
  { label: 'Who', says: 'vs lefties · vs righties · pinch hitters · starters · relievers · day games · night games · at home · on the road' },
  { label: 'At-bat length', says: '16+ pitch at-bats · 8-pitch at-bats · long at-bats (Pro)' },
  { label: 'Stat', says: 'batting average · OPS · home runs · stolen bases · ERA · WHIP · errors · fielding percentage · …' },
  { label: 'Show it as', says: 'by inning · by count · by month · by team · by position · leaders · last time it happened (Pro)' },
]

const box: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }
const head: React.CSSProperties = { padding: '7px 12px', background: C.soft, borderBottom: `1px solid ${C.line}`, fontFamily: SANS, fontWeight: 800, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink }

export default function HelpBar({ onTry }: { onTry: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <aside className="ql-help-side" aria-label="Help" style={{ position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', display: 'grid', gap: 12, fontFamily: SANS }}>
      <button type="button" className="ql-help-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, padding: '9px 12px', borderRadius: 5, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer', textAlign: 'left' }}>
        {open ? 'Hide help' : '? How to use this page'}
      </button>
      <div className={`ql-help-body${open ? ' open' : ''}`} style={{ display: 'grid', gap: 12 }}>
        <section style={box}>
          <div style={head}>How to use this page</div>
          <ol style={{ margin: 0, padding: '10px 12px 12px 30px', fontSize: 13, color: '#3a352c', lineHeight: 1.5, display: 'grid', gap: 8 }}>
            <li><b>Ask or set it up.</b> Type a question in the search box, or use the panels: <i>Scope</i> (who and when) and <i>Situation</i> (the moment in the game).</li>
            <li><b>Say how to show it.</b> After a search it asks for the output and the metrics. Begin with just the answer, then widen it.</li>
            <li><b>Group it.</b> <i>Group results by</i> turns one number into a breakdown — by inning, count, season, team or player.</li>
            <li><b>Watching a game?</b> Open <i>Live situations</i> (top of the page) to see every game in progress and ask when its moment last happened — by year, postseason, club or player. <ProBadge /></li>
            <li><b>Find the last time.</b> Ask “when did this last happen?” (or choose <i>Last happened</i>) for the newest occurrences. Open any row to see every pitch of that plate appearance. <ProBadge /></li>
            <li><b>Go deeper.</b> Open a row (▸): a club opens to its players, a player to their games, a game to every {`plate appearance or pitch`}. <ProBadge /></li>
            <li><b>Take it with you.</b> Download a CSV or a PNG of exactly what you see. <ProBadge /></li>
          </ol>
        </section>

        <section style={box}>
          <div style={head}>Finding rare stats</div>
          <div style={{ padding: '10px 12px 12px', fontSize: 13, color: '#3a352c', lineHeight: 1.5 }}>
            Type it the way you would say it out loud — the search finds the season, the moment in the game and the stat. Click any example to run it.
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {RARE.map(e => (
                <button key={e.text} type="button" onClick={() => onTry(e.text)}
                  style={{ textAlign: 'left', fontFamily: SANS, fontSize: 12.5, lineHeight: 1.35, padding: '7px 9px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer' }}>
                  “{e.text}” {e.pro && <ProBadge />}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 10 }}>
              The more specific the question, the rarer the stat. The page shows what it understood under the box — if it got something wrong, fix it in the panels.
            </div>
          </div>
        </section>

        <section style={box}>
          <div style={head}>Words it understands</div>
          <dl style={{ margin: 0, padding: '8px 12px 12px', display: 'grid', gap: 8 }}>
            {WORDS.map(w => (
              <div key={w.label}>
                <dt style={{ fontWeight: 800, fontSize: 11, color: C.orange, letterSpacing: '.06em', textTransform: 'uppercase' }}>{w.label}</dt>
                <dd style={{ margin: 0, fontSize: 12, color: '#5b5347', lineHeight: 1.45 }}>{w.says}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section style={box}>
          <div style={head}>Good to know</div>
          <ul style={{ margin: 0, padding: '10px 12px 12px 28px', fontSize: 12.5, color: '#3a352c', lineHeight: 1.5, display: 'grid', gap: 6 }}>
            <li><b>One situation at a time</b> in Quick mode. To combine them (7th inning+ <i>and</i> runners in scoring position), use <i>Stack filters</i>. <ProBadge /></li>
            <li><b>Games (G)</b> counts each game once. Situations only one team can have (9th inning, bases loaded) show a dash.</li>
            <li><b>Fielding</b> has no situations — MLB only publishes season totals and position.</li>
            <li><b>Small samples</b> are flagged, never hidden. Check the sample column before reading much into a number.</li>
            <li><b>Not here:</b> pitch-mix stats like fastball %. If a stat isn’t listed in the metric menu, it isn’t available yet.</li>
          </ul>
          <div style={{ padding: '0 12px 12px', fontFamily: MONO, fontSize: 10, color: C.faint }}></div>
        </section>
      </div>
    </aside>
  )
}

/** The short helper on the Live situations page. */
export function LiveHelp() {
  return (
    <section style={box}>
      <div style={head}>How this page works</div>
      <ol style={{ margin: 0, padding: '10px 12px 12px 30px', fontSize: 13, color: '#3a352c', lineHeight: 1.5, display: 'grid', gap: 7 }}>
        <li><b>Look at the live games.</b> Each card is a game in progress and the exact moment it is in.</li>
        <li><b>Click a game</b> to copy its current outs and runners into the search — or open its <i>“Every situation so far”</i> list to copy any earlier moment of that game. Use the small buttons to take the inning, score, count or handedness too — or set everything by hand.</li>
        <li><b>Say where and when.</b> Choose postseason or regular season, the years, and optionally a club and a player.</li>
        <li><b>Find the last time.</b> You get the newest matches first. Open any row to see every pitch of that at-bat.</li>
      </ol>
      <div style={{ padding: '0 12px 12px', fontSize: 12, color: C.mute, lineHeight: 1.5 }}>
        Tip: the more you set, the rarer the moment. If nothing comes back, widen the years or remove one detail.
      </div>
    </section>
  )
}
