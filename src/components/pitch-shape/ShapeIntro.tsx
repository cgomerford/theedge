// src/components/pitch-shape/ShapeIntro.tsx
//
// The plain-language opener for the Pitch Shape Lab, for someone who has never read a movement chart: what shape is and why it matters, the four steps to use the page, and the ways to find a pitcher.
// Server component, text and links only. Open on a first visit; folded away once a pitcher is chosen so his page leads. Describes what pitches do; nothing here looks forward.
import Link from 'next/link'
import { C } from '@/components/team/ui'

const h: React.CSSProperties = { margin: '0 0 8px', fontSize: 11, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase' }
const list: React.CSSProperties = { margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: 14, lineHeight: 1.5, color: '#3d382f' }

function Long({ side = false }: { side?: boolean }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 14, color: C.orange, minHeight: 32 }}>Read more: what shape is, why it matters, and how to find pitchers</summary>
      <div className="psl-intro" style={{ display: 'grid', gridTemplateColumns: side ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))', gap: side ? 18 : 28, marginTop: 14 }}>
        <style>{'@media(max-width:1000px){.psl-intro{grid-template-columns:1fr !important}}'}</style>
        <div>
          <div style={h}>What pitch shape is</div>
          <ul style={list}>
            <li><b>Shape is how a pitch moves, not how fast it is.</b> Two fastballs can leave the hand at the same speed and still travel very differently.</li>
            <li><b>Two numbers describe it, in inches.</b> <i>Ride</i> is how much the pitch stays up compared with a ball thrown with no spin. <i>Sideways movement</i> is how far it moves toward the pitcher’s arm side (right on the map) or glove side (left).</li>
            <li><b>Speed and arm angle fill in the picture.</b> A slow pitch and a hard one can share a shape, and a low arm slot changes how the same shape plays.</li>
          </ul>
          <div style={{ ...h, marginTop: 14 }}>Why it matters</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#3d382f' }}>Hitters miss some shapes far more than others. The map shows which, using every tracked pitch, so you can see why a pitcher’s fastball gets swings and misses, or doesn’t, and who else throws something like it.</p>
        </div>
        <div>
          <div style={h}>How to use it, in four steps</div>
          <ol style={list}>
            <li><b>Choose a pitch.</b> Set the level, pitch type and throwing hand in the panel on the right of the banner. Four-seam fastball is a good first one.</li>
            <li><b>Read the colours.</b> Each box on the map is one way a pitch can move. Red means hitters miss it often, blue means they rarely do. The key beside the map says exactly how much.</li>
            <li><b>Click a spot.</b> The panel beside the map shows what pitches that move like this have produced against the league average, and who throws them. The Players, Levels, League average and Leaderboard tabs go deeper on that spot.</li>
            <li><b>Open a pitcher.</b> Click a name, a marked pitcher on the map or a row in a table, and the page becomes his story: his banner, his results, his shape, who else throws it, how it changed and why the results are what they are.</li>
          </ol>
        </div>
        <div>
          <div style={h}>How to find pitchers</div>
          <ul style={list}>
            <li><b>Search by name</b> in the panel on the right of the banner. The page then becomes about him.</li>
            <li><b>Click the map.</b> The Players tab lists everyone whose average shape is near that spot, and who is above or below what their shape usually gets.</li>
            <li><b>Use the marked pitchers.</b> The map marks pitchers with a strong shape and results below it, labelled with their ERA; switch the set to see other groups. The Fantasy tab lists who is rostered in few leagues.</li>
            <li><b>Filter by speed or arm angle</b> to find slower pitchers or lower arm slots whose shape stands out. Choose a year, or all seasons, with the Season control.</li>
          </ul>
          <p style={{ margin: '12px 0 0', fontSize: 13.5 }}>
            <Link href="/mlb/lab/pitch-shape/guide" style={{ color: C.orange, fontWeight: 800 }}>Full guide →</Link>{' '}
            <Link href="/mlb/lab/pitch-shape/how-shape-is-built" style={{ color: C.orange, fontWeight: 800, marginLeft: 12 }}>How shape is built →</Link>
          </p>
        </div>
      </div>
    </details>
  )
}

/** A two-line definition and the three steps, always visible and short so the map stays near the top; the long explainer is one click away. With a pitcher chosen it shrinks to a single line. */
export default function ShapeIntro({ pitcherChosen, side = false }: { pitcherChosen: boolean; /** the narrow right-hand column: the same words stacked, under a "How to use" heading */ side?: boolean }) {
  if (side) {
    const stepS = (n: number, t: string, d: string) => (
      <li style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <b style={{ flex: 'none', width: 24, height: 24, borderRadius: 12, background: C.ink, color: C.cream, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5 }}>{n}</b>
        <span style={{ fontSize: 13.5, lineHeight: 1.45, color: '#3d382f' }}><b>{t}</b> {d}</span>
      </li>
    )
    return (
      <section aria-label="How to use this page" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 800, color: C.orange, textTransform: 'uppercase', marginBottom: 6 }}>How to use</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: C.ink }}><b>A pitch’s shape is how it moves, not how fast it goes:</b> how much it rises (<i>ride</i>) and how far it runs toward the pitcher’s arm side or glove side, in inches. The page shows how often hitters miss each shape and who throws it.</p>
        <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 10 }}>
          {stepS(1, 'Choose a pitch.', 'Set the level, pitch type and throwing hand above.')}
          {stepS(2, 'Click the map.', 'Red boxes are shapes hitters miss often; blue, rarely. A click shows the results there and who throws it.')}
          {stepS(3, 'Open a pitcher.', 'Search a name or click a marked pitcher, and the page becomes his story.')}
        </ol>
        <Long side />
      </section>
    )
  }
  if (pitcherChosen) {
    return (
      <details style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 14px', marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 14, minHeight: 36, display: 'flex', alignItems: 'center' }}>New here? What pitch shape is, and how to read this page</summary>
        <Long />
      </details>
    )
  }
  const step = (n: number, t: string, d: string) => (
    <li style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
      <b style={{ flex: 'none', width: 26, height: 26, borderRadius: 13, background: C.ink, color: C.cream, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{n}</b>
      <span style={{ fontSize: 14, lineHeight: 1.45, color: '#3d382f' }}><b>{t}</b> {d}</span>
    </li>
  )
  return (
    <section aria-label="What this page is" style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6, padding: '14px 20px', marginBottom: 16 }}>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: C.ink, maxWidth: 980 }}>
        <b>A pitch’s shape is how it moves, not how fast it goes:</b> how much it rises (<i>ride</i>) and how far it runs to the pitcher’s arm side or glove side, in inches. This page shows how often hitters miss each shape and who throws it.
      </p>
      <ol className="psl-steps" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        <style>{'@media(max-width:900px){.psl-steps{grid-template-columns:1fr !important}}'}</style>
        {step(1, 'Choose a pitch.', 'Use the panel on the right of the banner: level, pitch type and throwing hand.')}
        {step(2, 'Click the map.', 'Red boxes are shapes hitters miss often; blue, rarely. A click shows the results there and who throws it.')}
        {step(3, 'Open a pitcher.', 'Search a name or click a marked pitcher, and the page becomes his story.')}
      </ol>
      <Long />
    </section>
  )
}

