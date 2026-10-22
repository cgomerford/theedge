'use client'

// src/components/stats/StatsHub.tsx
//
// The Stats, at /mlb/stats. One wide page with three ways in:
//   Ask the Stats     – search any stat, filter, break it down, chart it
//   Player Explorer   – every player's numbers side by side
//   Games             – a sub page (/mlb/stats/games): the scoreboard for any date, each game opening a full explorer
//   Live situations   – a sub page (/mlb/stats/live): what is happening now, and when it last happened
// isPro / isSignedIn are passed straight through — never defaulted here.

import { useState } from 'react'
import Link from 'next/link'
import StatsExplorer from '@/components/stats/StatsExplorer'
import StatsQueryLab from '@/components/stats/StatsQueryLab'
import { Hint } from '@/components/stats/queryUi'
import { C, SANS } from '@/components/team/ui'

type Tab = 'ask' | 'explorer'
export const STATS_MAX_WIDTH = 1560

const tabStyle = (on: boolean): React.CSSProperties => ({
  fontFamily: SANS, fontWeight: 800, fontSize: 14, padding: '9px 18px', borderRadius: 5, cursor: 'pointer', textDecoration: 'none',
  border: `1px solid ${on ? C.ink : C.line}`, background: on ? C.ink : '#fff', color: on ? '#fff' : C.mute, display: 'inline-flex', alignItems: 'center', gap: 6,
})

export default function StatsHub({ isPro, isSignedIn }: { isPro: boolean; isSignedIn: boolean }) {
  const [tab, setTab] = useState<Tab>('ask')
  return (
    <>
      <div style={{ maxWidth: STATS_MAX_WIDTH, margin: '0 auto', padding: '18px 24px 0' }}>
        <div style={{ fontFamily: SANS, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: 30, letterSpacing: '-0.02em' }}>The Stats</h1>
          <span style={{ fontSize: 15, color: '#5b5347' }}>Find any number in baseball — then break it down.</span>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button role="tab" aria-selected={tab === 'ask'} type="button" onClick={() => setTab('ask')} style={tabStyle(tab === 'ask')}>Ask the Stats</button>
            <Hint text="Type a question (“postseason batting average after the 6th inning”) or set the filters, and get a number, table or chart." />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button role="tab" aria-selected={tab === 'explorer'} type="button" onClick={() => setTab('explorer')} style={tabStyle(tab === 'explorer')}>Player Explorer</button>
            <Hint text="Every player's season numbers in one sortable table. Select players to compare them." />
          </span>
          <Link href="/mlb/stats/games" style={tabStyle(false)}>Games &amp; past games →</Link>
          <Link href="/mlb/stats/live" style={tabStyle(false)}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: C.orange, display: 'inline-block' }} /> Live situations →
          </Link>
        </div>
      </div>
      {/* Both stay mounted so switching tabs doesn't refetch or lose filters. */}
      <div style={{ display: tab === 'ask' ? 'block' : 'none', maxWidth: STATS_MAX_WIDTH, margin: '0 auto', padding: '16px 24px 60px' }}>
        <StatsQueryLab isPro={isPro} />
      </div>
      <div style={{ display: tab === 'explorer' ? 'block' : 'none' }}>
        <StatsExplorer isPro={isPro} isSignedIn={isSignedIn} />
      </div>
    </>
  )
}
