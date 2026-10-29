// src/components/sequencing-lab/StrikeoutStructure.tsx
//
// A pitcher's strikeouts by time through: his total, then the first time he faced a hitter in a game, the second time and the third or later, each with its strikeout rate against the
// league's, how the strikeouts were built (the pitch that ended them and the pitch they opened with), and a plain sentence on what changed. A time-through under the minimum shows
// "Small sample (n = X)" and no rate. Counts of what has happened, never a forecast. Server-safe: no scripts, no state.

import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import type { KLook, KStructure } from '@/lib/k-structure/data'
import PitchDot, { dotColor } from './PitchDot'
import { kick, note, star, tile } from './ui'

const MIN_PA = MIN_SAMPLE.kStructurePAs, MIN_K = MIN_SAMPLE.kStructureKs
const NAME: Record<number, string> = { 1: 'The first time through', 2: 'The second time through', 3: 'The third time or later' }
const SHORT: Record<number, string> = { 1: 'first time', 2: 'second time', 3: 'third time or later' }
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const share = (m: Record<string, number>, t: string) => pct(m[t] ?? 0, Object.values(m).reduce((a, b) => a + b, 0))

function Mix({ title, mix, total }: { title: string; mix: Record<string, number>; total: number }) {
  const top = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const rest = total - top.reduce((a, [, n]) => a + n, 0)
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: C.faint, textTransform: 'uppercase' }}>{title}</div>
      <div role="img" aria-label={`${title}: ${top.map(([t, n]) => `${pitchLabel(t)} ${Math.round(pct(n, total))}%`).join(', ')}`} style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', gap: 1, margin: '4px 0', background: C.soft }}>
        {top.map(([t, n]) => <span key={t} style={{ width: `${pct(n, total)}%`, background: dotColor(t) }} />)}
        {rest > 0 && <span style={{ width: `${pct(rest, total)}%`, background: '#d8d2c4' }} />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: '#3a352c' }}>
        {top.map(([t, n]) => <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PitchDot t={t} size={14} />{Math.round(pct(n, total))}%</span>)}
      </div>
    </div>
  )
}

/** The sentence on what changed between the first and second time through, from his own counts (returns null when either side is too small). */
function story(name: string, first: KLook | undefined, second: KLook | undefined, lg1: KLook | undefined, lg2: KLook | undefined): string | null {
  if (!first || !second || first.pas < MIN_PA || second.pas < MIN_PA) return null
  const k1 = pct(first.ks, first.pas), k2 = pct(second.ks, second.pas)
  const parts: string[] = [`${name} struck out ${k1.toFixed(0)}% of hitters the first time through and ${k2.toFixed(0)}% the second${lg1 && lg2 ? ` (the league: ${pct(lg1.ks, lg1.pas).toFixed(0)}% then ${pct(lg2.ks, lg2.pas).toFixed(0)}%)` : ''}.`]
  if (first.ks >= MIN_K && second.ks >= MIN_K) {
    const shift = (a: Record<string, number>, b: Record<string, number>) => {
      const types = new Set([...Object.keys(a), ...Object.keys(b)])
      return [...types].map(t => ({ t, a: share(a, t), b: share(b, t) })).sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a))[0]
    }
    const o = shift(first.openers, second.openers), f = shift(first.finishers, second.finishers)
    if (o && Math.abs(o.b - o.a) >= 8) parts.push(`${o.a.toFixed(0)}% of his first-time strikeouts opened with the ${pitchLabel(o.t).toLowerCase()}; the second time it was ${o.b.toFixed(0)}%.`)
    if (f && Math.abs(f.b - f.a) >= 8) parts.push(`They ended on the ${pitchLabel(f.t).toLowerCase()} ${f.a.toFixed(0)}% of the time the first time and ${f.b.toFixed(0)}% the second.`)
  }
  return parts.join(' ')
}

export default function StrikeoutStructure({ data, name }: { data: KStructure | null; name: string }) {
  if (!data) return (
    <div style={{ ...tile, fontFamily: SANS }}>
      <div style={kick}>Strikeouts by time through</div>
      <p style={note}>This pitcher&apos;s strikeout breakdown is not available yet.</p>
    </div>
  )
  const by = (l: 1 | 2 | 3) => data.looks.find(x => x.look === l)
  const lg = (l: 1 | 2 | 3) => data.league.find(x => x.look === l)
  const totalK = data.looks.reduce((a, x) => a + x.ks, 0), totalPA = data.looks.reduce((a, x) => a + x.pas, 0)
  const text = story(name, by(1), by(2), lg(1), lg(2))
  return (
    <section aria-label="Strikeouts by time through" style={{ ...tile, fontFamily: SANS }}>
      <div style={kick}>Strikeouts · first time through, second time through</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px', marginTop: 6 }}>
        <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{totalK.toLocaleString('en-US')}</span>
        <span style={{ fontSize: 15, color: '#3a352c' }}>strikeouts in {totalPA.toLocaleString('en-US')} plate appearances ({pct(totalK, totalPA).toFixed(1)}%) this season</span>
      </div>
      {text && <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.5, maxWidth: 820, fontWeight: 600 }}>{text}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12, marginTop: 14 }}>
        {([1, 2, 3] as const).map(l => {
          const x = by(l), y = lg(l)
          const enoughPA = !!x && x.pas >= MIN_PA, enoughK = !!x && x.ks >= MIN_K
          return (
            <div key={l} style={{ background: '#faf8f3', borderRadius: 12, padding: 14, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{NAME[l]}</div>
              {!x ? <p style={{ ...note, margin: '6px 0 0' }}>No plate appearances.</p> : (
                <>
                  <div style={{ marginTop: 6 }}>
                    {enoughPA ? <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{pct(x.ks, x.pas).toFixed(1)}%</span> : <span style={{ fontSize: 13, fontWeight: 700 }}>Small sample (n = {x.pas}){star}</span>}
                    <span style={{ fontSize: 12.5, color: C.mute, marginLeft: 8 }}>{x.ks} K in {x.pas} PA</span>
                  </div>
                  {enoughPA && y && <div style={{ fontSize: 12, color: C.mute }}>League {pct(y.ks, y.pas).toFixed(1)}% · {(pct(x.ks, x.pas) - pct(y.ks, y.pas)) >= 0 ? '+' : ''}{(pct(x.ks, x.pas) - pct(y.ks, y.pas)).toFixed(1)} points</div>}
                  {enoughK ? (
                    <>
                      <Mix title="Strikeouts ended on" mix={x.finishers} total={x.ks} />
                      <Mix title="Strikeouts opened with" mix={x.openers} total={x.ks} />
                      <div style={{ fontSize: 12, color: '#3a352c', marginTop: 10 }}>{Math.round(pct(x.swinging, x.ks))}% swinging, {Math.round(pct(x.looking, x.ks))}% looking · {(x.kPitches / x.ks).toFixed(1)} pitches per strikeout</div>
                    </>
                  ) : x.ks > 0 || enoughPA ? <p style={{ ...note, margin: '8px 0 0' }}>Too few strikeouts to show how they were built (n = {x.ks}){star}</p> : null}
                </>
              )}
            </div>
          )
        })}
      </div>
      <p style={note}>&quot;Time through&quot; is how many times he has faced that hitter in the game: the first plate appearance, the second, then the third or later. A strikeout rate needs {MIN_PA} plate appearances and the pitch mixes {MIN_K} strikeouts; below that the figure is not shown. The league line is every pitcher. This describes what has happened this season, not what a hitter will do next time.</p>
    </section>
  )
}
