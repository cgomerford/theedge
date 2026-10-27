// src/components/scout/ScoutAppendix.tsx: the key to every Scout Report tab, shown once under the tabs. Small-sample asterisk and the minimums each tab uses, the colour and dot
// keys, and the definitions that recur. The sitewide rule is on /how-it-works#sample-size; the minimums here are the ones the Scout tabs apply.
import Link from 'next/link'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { MIN_ABS_N, MIN_RANK_CHALLENGES, MIN_UMP_GAMES } from '@/lib/scout/abs-consts'
import { MIN_SITUATION_N } from '@/lib/scout/situations'

const h: React.CSSProperties = { margin: '0 0 6px', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722' }
const p: React.CSSProperties = { margin: '0 0 6px', fontSize: 13, lineHeight: 1.55, color: '#3a352c' }
const star = <b style={{ color: '#D4533B' }}>*</b>
const dot = (fill: string, stroke: string) => <svg width="13" height="13" viewBox="0 0 14 14" style={{ verticalAlign: '-2px' }}><circle cx="7" cy="7" r="5" fill={fill} stroke={stroke} strokeWidth="1.6" /></svg>

export default function ScoutAppendix() {
  return (
    <details id="appendix" style={{ background: '#fff', border: '1px solid #e7e2d8', borderRadius: 14, padding: '12px 16px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>Appendix · how to read this report</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, marginTop: 14 }}>
        <div>
          <div style={h}>Small samples</div>
          <p style={p}>{star} A red asterisk means a small sample: too few pitches, plate appearances or attempts to read a rate from. The number is shown with the count behind it, never as if it settled anything. Hover any figure for its count. The sitewide rule is on <Link href="/how-it-works#sample-size" style={{ color: '#FF5722', fontWeight: 800 }}>How it works</Link>.</p>
          <p style={p}>Minimums used here:</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: '#3a352c' }}>
            <li>Situational splits (late and close, runners in scoring position, platoon): {MIN_SAMPLE.splitPA} plate appearances or batters faced; platoon, home and road and day and night: 30 PA, 40 batters faced</li>
            <li>Head-to-head and inherited runners: {MIN_SAMPLE.h2hPA}</li>
            <li>ABS: {MIN_ABS_N} challenges to read a rate, {MIN_RANK_CHALLENGES} to be ranked, {MIN_SITUATION_N} for a count or situation cell, {MIN_UMP_GAMES} games for an umpire</li>
            <li>Steals: 10 attempts; a runner&apos;s or pitcher&apos;s lead needs 100 Statcast chances</li>
            <li>Alignment: 60 pitches against a side of the plate, 25 against one hitter</li>
            <li>Late-inning relievers: 3 appearances to be listed, 10 late innings to read runs per nine</li>
            <li>Form: 150 plate appearances for a read; hitter type needs 100</li>
          </ul>
        </div>
        <div>
          <div style={h}>Colour and dot keys</div>
          <p style={p}>Red = the hitter does damage (above his own line, a hotter zone, a longer lead). Blue = better for the pitcher or the fielder. Orange is the club or player the bar is about. Grey is the league or the season.</p>
          <p style={p}><b>ABS maps.</b> {dot('#FF5722', '#c4410f')} Orange dot = a challenge that was overturned. {dot('#fff', '#5b5347')} White dot = upheld, the umpire&apos;s call stood. The solid box is the zone; the dashed box is the zone plus the ball&apos;s radius.</p>
          <p style={p}><b>Fielding maps.</b> White dot = a fielder&apos;s usual spot. Orange dot = where an infield shade moves him, toward the pull side.</p>
          <p style={p}><b>Availability.</b> ● available · ▲ questionable · ■ out. Questionable is derived from a stated rule, not reported by the club.</p>
          <p style={p}><b>Tonight.</b> A small orange tag marks the split that matches this game.</p>
        </div>
        <div>
          <div style={h}>Definitions that recur</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: '#3a352c' }}>
            <li><b>Late and close:</b> the 7th inning or later with the batting club tied, ahead by one, or the tying run on deck.</li>
            <li><b>Saves, holds, blown saves:</b> stand in for entering with the tying or go-ahead run in play; the leverage at entry is not published.</li>
            <li><b>Inches off the edge:</b> from the ball&apos;s centre to the edge of the zone, positive outside. A ball up to about 1.5 in outside still touches the zone and is a strike. Approximate near the top and bottom.</li>
            <li><b>Overturned:</b> the challenged call was reversed.</li>
            <li><b>Outs Above Average:</b> outs made above what an average fielder makes on the same plays.</li>
            <li><b>Primary and secondary lead:</b> a runner&apos;s distance off first before the pitch and as the ball is delivered, in feet.</li>
            <li><b>Pop time:</b> the pitch reaching the catcher&apos;s glove to the ball reaching second base.</li>
            <li><b>Park factor:</b> 100 is an average park; 110 means 10% more of that outcome.</li>
          </ul>
        </div>
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 12, color: '#8a8275' }}>Everything in this report describes what has happened, with the sample behind it. It is not a prediction and not advice.</p>
    </details>
  )
}
