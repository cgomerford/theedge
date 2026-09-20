// src/components/scout/ParkSection.tsx
//
// §8 Park factors deep — tonight's venue on Baseball Savant's Statcast Park
// Factors (100 = league average, 3-year rolling): the full set of indexes, the
// same park by session (Day / Night / Roof closed) with tonight's session marked,
// and by batter hand. Deeper than the Preview's one-line weather read.

import { getParkDeep, type ParkIndexes, type Session } from '@/lib/scout/park-deep'
import { getParkFactor } from '@/lib/parks'
import { InfoButton } from '@/components/InfoButton'
import { IndexBars } from './charts/Atoms'
import { CenteredRadar } from './charts/Radar'
import type { ScoutContext } from './types'

function ParkInfo() {
  return (
    <InfoButton title="How to read park factors" align="left">
      <p className="mb-1.5"><b>100 = an average MLB park.</b> 110 means the park produces 10% more of that outcome than an average park would with the same hitters and pitchers; 90 means 10% less.</p>
      <p className="mb-1.5"><b>Why a bar goes right or left.</b> Right (blue) = above 100, the park produces more of it. Left (orange) = below 100, less. The colour isn&apos;t good or bad — it is just direction. For Strikeouts, right means more Ks (a pitcher&apos;s park); for Walks, right means more walks.</p>
      <ul className="space-y-0.5 mb-1.5">
        <li><b>Runs</b> — runs scored per game there.</li>
        <li><b>Home runs</b> — HR rate.</li>
        <li><b>wOBA</b> — overall offensive value per plate appearance.</li>
        <li><b>Hard-hit</b> — share of batted balls at 95+ mph.</li>
        <li><b>1B / 2B / 3B</b> — how often balls in play become that hit (gaps, wall shape, foul ground).</li>
        <li><b>Strikeouts / Walks</b> — how often each happens there.</li>
      </ul>
      <p className="mb-1.5"><b>Sessions.</b> Day, night and roof-closed games can play differently (air, shadows, roof), so each is shown, with tonight&apos;s marked.</p>
      <p><b>Why FanGraphs can differ.</b> These are Baseball Savant&apos;s Statcast park factors over a rolling three seasons. FanGraphs builds its own factors with a different method and window, so the numbers won&apos;t match one for one — neither is wrong.</p>
    </InfoButton>
  )
}

const ord = (n: number) => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }
const label = (v: number) => (v === 100 ? 'league average' : `${Math.abs(v - 100)}% ${v > 100 ? 'above' : 'below'} average`)

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1.5">{title}</p>{children}</div>
}

export default async function ParkSection({ ctx }: { ctx: ScoutContext }) {
  const [park, pf] = await Promise.all([getParkDeep(ctx.venueId, ctx.venueName), getParkFactor(ctx.venueName).catch(() => null)])
  if (!park) return <p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Statcast park factors are unavailable for {ctx.venueName} right now.</p>

  const all = park.bySession.All as ParkIndexes
  const tonight: Session | null = ctx.dayNight === 'day' ? 'Day' : ctx.dayNight === 'night' ? 'Night' : null
  const sessions = (['Day', 'Night', 'Roof Closed'] as Session[]).filter((s) => park.bySession[s])
  const metric = (title: string, pick: (i: ParkIndexes) => number) => (
    <Block key={title} title={title}>
      <IndexBars rows={sessions.map((s) => ({ label: s === 'Roof Closed' ? 'Roof closed' : s, value: pick(park.bySession[s] as ParkIndexes), note: `${(park.bySession[s] as ParkIndexes).pa.toLocaleString()} PA`, highlight: s === tonight }))} />
    </Block>
  )
  const hand = (title: string, pick: (i: ParkIndexes) => number) => park.byHand.L && park.byHand.R ? (
    <Block key={title} title={title}>
      <IndexBars rows={[{ label: 'Left-handed batters', value: pick(park.byHand.L) }, { label: 'Right-handed batters', value: pick(park.byHand.R) }]} />
    </Block>
  ) : null

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
        <p className="text-[12px] font-sans font-bold text-stone-900 flex items-center gap-1.5">{park.venueName}<ParkInfo /></p>
        <p className="text-[11px] font-sans text-stone-600 leading-snug mt-0.5">
          Runs play {label(all.runs)}{park.rank ? ` (${park.rank.runs}${ord(park.rank.runs)} of ${park.rank.of})` : ''}; home runs {label(all.hr)}{park.rank ? ` (${park.rank.hr}${ord(park.rank.hr)})` : ''}; wOBA {label(all.woba)}.
          {tonight && park.bySession[tonight] ? ` Tonight is a ${tonight.toLowerCase()} game — ${tonight.toLowerCase()} sessions here run ${park.bySession[tonight]!.runs} for runs and ${park.bySession[tonight]!.hr} for home runs.` : ''}
          {pf && (pf.altitude_feet > 1000 || pf.is_dome) ? ` ${pf.altitude_feet > 1000 ? `Altitude ${pf.altitude_feet.toLocaleString()} ft.` : ''}${pf.is_dome ? ' Domed / roofed park.' : ''}` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100">
        <div className="space-y-4">
          <Block title="Park shape — every index at once">
            <CenteredRadar ariaLabel={`${park.venueName} park factor radar: runs ${all.runs}, home runs ${all.hr}, wOBA ${all.woba}`}
              axes={[
                { label: 'Runs', value: all.runs }, { label: 'HR', value: all.hr }, { label: 'wOBA', value: all.woba }, { label: 'Hard-hit', value: all.hardhit },
                { label: '1B', value: all.h1b }, { label: '2B', value: all.h2b }, { label: '3B', value: all.h3b }, { label: 'BB', value: all.bb }, { label: 'K', value: all.so },
              ]} />
            <p className="text-[9.5px] font-mono text-stone-300 text-center mt-1">Dashed ring = league average (100). A spoke outside the ring is above average; inside is below. K is above 100 when the park produces more strikeouts.</p>
          </Block>
          <Block title={`All sessions · ${all.pa.toLocaleString()} PA · ${park.years}`}>
            <IndexBars axis rows={[
              { label: 'Runs', value: all.runs }, { label: 'Home runs', value: all.hr }, { label: 'wOBA', value: all.woba }, { label: 'Hard-hit', value: all.hardhit },
              { label: 'Singles', value: all.h1b }, { label: 'Doubles', value: all.h2b }, { label: 'Triples', value: all.h3b },
              { label: 'Strikeouts', value: all.so, note: 'above 100 = more Ks' }, { label: 'Walks', value: all.bb },
            ]} />
          </Block>
        </div>
        <div className="space-y-4 lg:pl-6">
          {metric('Runs by session', (i) => i.runs)}
          {metric('Home runs by session', (i) => i.hr)}
          {metric('wOBA by session', (i) => i.woba)}
          {hand('Home runs by batter hand', (i) => i.hr)}
          {hand('wOBA by batter hand', (i) => i.woba)}
        </div>
      </div>

      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Source: Baseball Savant Statcast Park Factors, {park.years} rolling (three seasons, so one hot month doesn&apos;t move it). 100 = league average; above 100 favours hitters (for strikeouts, above 100 means more strikeouts). {sessions.includes('Roof Closed') ? 'Roof-closed figures cover only games played with the roof shut.' : 'This park has no roof-closed sample.'} Bars are capped at ±30.
      </p>
    </div>
  )
}
