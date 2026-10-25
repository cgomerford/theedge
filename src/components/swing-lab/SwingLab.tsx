'use client'

// src/components/swing-lab/SwingLab.tsx
//
// Body of the Batting Lab "Decisions" tab (mockups/swing-lab.html). Did he make the league's average-worth
// choice, pitch by pitch? Four numbered sections — The question (Selection / Aggression + count ladder) · The decision
// grid · What changed · Method. Descriptions of what happened with the sample behind every number; nothing looks forward.
//
// `isPro` is a REQUIRED prop. The batting-lab route is Pro-gated server-side, and the server page only fetches `data`
// when isPro; a non-Pro render gets a locked card with a feature list and no numbers. Every sample gate lives in
// lib/swing-decisions/model.ts (GATE). The pitches behind a cell come from /api/lab/swing-pitches when a cell is tapped.

import { useEffect, useMemo, useState } from 'react'
import { C, Card, Empty, Foot, Section } from '@/components/team/ui'
import { LockedCard } from '@/components/pitch-shape/parts'
import {
  COL_LABELS, COUNT_GROUPS, FAMILIES, GATE, HANDS, ROW_LABELS,
  cellsFor, filterRows, inZone, ladderFor, leagueIndex, summarize,
  type Agg, type CountGroup, type Family, type HandFilter, type SwingLabData,
} from '@/lib/swing-decisions/model'

const CAP = 3 // runs per 100 pitches at which the colour ramp saturates
const pct = (x: number) => `${Math.round(x * 100)}%`
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return (Number(t) === 0 ? '' : v > 0 ? '+' : '−') + t }
const fmt = (n: number) => n.toLocaleString('en-US')
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const cellName = (r: number, c: number) => `${ROW_LABELS[r]} · ${COL_LABELS[c]}`
const famLabel = (k: Family) => FAMILIES.find(f => f.key === k)!.label.toLowerCase()
const handLabel = (h: HandFilter) => (h === 'all' ? 'all pitchers' : h === 'R' ? 'right-handers' : 'left-handers')

/** Diverging colour: orange (runs given away) ← white → green (better than the league), capped at ±CAP. */
function tone(v: number) {
  const a = clamp(Math.abs(v) / CAP, 0, 1), base = v >= 0 ? [29, 158, 117] : [255, 87, 34]
  const mix = base.map(ch => Math.round(255 + (ch - 255) * (0.12 + 0.88 * a)))
  return { bg: `rgb(${mix.join(',')})`, fg: a > 0.55 ? '#fff' : C.ink }
}
const RAMP = `linear-gradient(90deg,${[-3, -1.5, 0, 1.5, 3].map(v => tone(v).bg).join(',')})`

type PitchRow = { date: string; count: string; pitch: string; pitcher: string | null; hand: string; x: number; z: number; swing: boolean; outcome: string }
type PitchState = { status: 'idle' | 'loading' | 'error'; total: number; rows: PitchRow[] }

export default function SwingLab({ data, isPro }: { data: SwingLabData | null; isPro: boolean }) {
  const [count, setCount] = useState<CountGroup>('even')
  const [family, setFamily] = useState<Family>('fastball')
  const [hand, setHand] = useState<HandFilter>('all')
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [pitches, setPitches] = useState<PitchState>({ status: 'idle', total: 0, rows: [] })

  const idx = useMemo(() => (data ? leagueIndex(data.league) : null), [data])
  const cells = useMemo(() => (data && idx ? cellsFor(data.rows, idx, count, family, hand) : []), [data, idx, count, family, hand])
  const viewRows = useMemo(() => (data ? filterRows(data.rows, null, family, hand) : []), [data, family, hand])
  // until the viewer taps a cell, show the strongest estimated one
  const shown = useMemo<[number, number] | null>(() => {
    if (sel) return sel
    const best = cells.filter(x => x.ok && x.dv != null).sort((a, b) => Math.abs(b.dv!) - Math.abs(a.dv!))[0]
    return best ? [best.r, best.c] : null
  }, [sel, cells])
  const shownCell = shown ? cells[shown[0] * 5 + shown[1]] : null

  // the pitches behind the shown cell: a pitch-level request, made only when a cell with enough pitches is shown
  const batterId = data?.batterId
  const wanted = shownCell?.ok ? shown : null
  useEffect(() => {
    if (!batterId || !wanted) { setPitches({ status: 'idle', total: 0, rows: [] }); return }
    const ctl = new AbortController()
    setPitches(p => ({ ...p, status: 'loading' }))
    const q = new URLSearchParams({ batterId: String(batterId), count, family, hand, r: String(wanted[0]), c: String(wanted[1]) })
    fetch(`/api/lab/swing-pitches?${q}`, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { total: number; pitches: PitchRow[] }) => setPitches({ status: 'idle', total: j.total, rows: j.pitches }))
      .catch(e => { if (e?.name !== 'AbortError') setPitches({ status: 'error', total: 0, rows: [] }) })
    return () => ctl.abort()
  }, [batterId, wanted, count, family, hand])

  if (!isPro) {
    return <LockedCard title="Swing Lab" features={[
      'Selection and Aggression: did he take the pitches that lose runs to swing at, and swing at the ones that gain them',
      'A decision grid of where he gives pitches away and where he punishes mistakes, by count, pitch family and pitcher hand',
      'The pitches behind every spot, and what changed in the last 30 days',
    ]} />
  }
  if (!data || !idx) return <Empty>Swing decision data isn’t built for this hitter yet.</Empty>
  if (data.nSeason < GATE.season) {
    return <Card><div style={{ textAlign: 'center', padding: '26px 10px' }}>
      <div style={{ fontWeight: 800, fontSize: 20 }}>Not enough pitches yet (n = {fmt(data.nSeason)} of {GATE.season} needed)</div>
      <div style={{ color: C.mute, fontSize: 13, marginTop: 4 }}>The decision grid appears once a season has {GATE.season} pitches in the {data.season} location era.</div>
    </div></Card>
  }

  const M = summarize(viewRows, idx)
  const ladder = ladderFor(data.ladder, data.leagueCounts, family, hand)
  const grpN = filterRows(data.rows, count, null, 'all').reduce((a, x) => a + x.n_pitches, 0)
  const tile = (k: string, val: string, s: string) => (
    <div key={k} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.12em', fontWeight: 700, color: C.mute, textTransform: 'uppercase' }}>{k}</div>
      <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.15, marginTop: 2 }}>{val}</div>
      <div style={{ fontSize: 12, color: C.mute }}>{s}</div>
    </div>
  )
  const rate = (k: string, a: Pick<Agg, 'n' | 'swing' | 'lg'>, flip: boolean, note: string) => {
    if (a.n < GATE.cell || a.swing == null || a.lg == null) return tile(k, '—', `n = ${a.n} (under ${GATE.cell})`)
    return tile(k, pct(flip ? 1 - a.swing : a.swing), `n = ${fmt(a.n)} · league ${pct(flip ? 1 - a.lg : a.lg)} · ${note}`)
  }

  const okCells = cells.filter(x => x.ok && x.dv != null)
  const wins = okCells.filter(x => x.dv! > 0).sort((a, b) => b.dv! - a.dv!).slice(0, 3)
  const losses = okCells.filter(x => x.dv! < 0).sort((a, b) => a.dv! - b.dv!).slice(0, 3)

  return (
    <div>
      <style>{SWING_CSS}</style>

      <div className="sl-bars">
        <div><div className="sl-lbl">Count (grid)</div><Seg items={COUNT_GROUPS} cur={count} on={k => { setCount(k as CountGroup); setSel(null) }} /><div className="sl-defn">{COUNT_GROUPS.find(g => g.key === count)!.defn}</div></div>
        <div><div className="sl-lbl">Pitch family</div><Seg items={FAMILIES} cur={family} on={k => { setFamily(k as Family); setSel(null) }} /></div>
        <div><div className="sl-lbl">Pitcher hand</div><Seg items={HANDS} cur={hand} on={k => { setHand(k as HandFilter); setSel(null) }} /></div>
      </div>

      <Section id="question" num="01" title="The question" sub="Is he taking the pitches that lose runs to swing at, and swinging at the ones that gain runs? Then, count by count, how aggressive is he?">
        <div className="sl-tiles">
          {rate('Selection', M.junk, true, 'takes where a swing loses runs')}
          {rate('Aggression', M.hit, false, 'swings where a swing gains runs')}
          {rate('Outside-zone take rate', M.out, true, 'same pitches')}
          {rate('Middle-middle swing rate', M.mid, false, 'same pitches')}
          {tile('Pitches in view', fmt(M.all.n), `${famLabel(family)} · ${handLabel(hand)} · season total ${fmt(data.nSeason)}`)}
        </div>
        <Card title="The count ladder" style={{ marginTop: 16 }}>
          <p className="sl-cap">Swing rate in each count (bar) against the league’s on the same pitches (orange tick). {famLabel(family)} · {handLabel(hand)}. Counts under {GATE.count} pitches are hatched.</p>
          {ladder.map((x, i) => {
            const thin = x.n < GATE.count
            return (
              <div key={`${x.balls}-${x.strikes}`}>
                {i > 0 && x.strikes === 0 && ladder[i - 1].strikes !== 0 && <div className="sl-sep" />}
                <div className="sl-lr">
                  <span className="sl-ll">{x.balls}-{x.strikes}</span>
                  <div className="sl-lt">
                    {thin ? <i className="sl-lb sl-thin" style={{ width: '100%' }} /> : <><i className="sl-lb" style={{ width: `${(x.swing / 0.8) * 100}%` }} /><i className="sl-lk" style={{ left: `${(x.lg / 0.8) * 100}%` }} /></>}
                  </div>
                  <span className="sl-lv">{thin ? <em>n = {x.n}, not estimated</em> : <><b>{pct(x.swing)}</b><em>league {pct(x.lg)} · {sgn(Math.round((x.swing - x.lg) * 100), 0)} pts · n={fmt(x.n)}</em></>}</span>
                </div>
              </div>
            )
          })}
          <Foot>Swing rate = swings ÷ pitches seen in that count. A single count needs {GATE.count} pitches to be shown.</Foot>
        </Card>
      </Section>

      <Section id="grid" num="02" title="The decision grid" sub={`${COUNT_GROUPS.find(g => g.key === count)!.label} counts · ${famLabel(family)} · ${handLabel(hand)}.`}>
        {grpN < GATE.group ? (
          <Card><div style={{ textAlign: 'center', padding: '22px 10px' }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Not enough pitches in these counts (n = {fmt(grpN)} of {GATE.group} needed)</div>
            <div style={{ color: C.mute, fontSize: 13 }}>Try another count group.</div>
          </div></Card>
        ) : (
          <>
            <div className="sl-lab">
              <Card title="The decision grid">
                <p className="sl-cap">Batter’s view: inside on the left, away on the right, whichever side he bats. Colour is his decision runs against the league’s average choice in the same count, spot, pitch family and pitcher hand. Tap a cell.</p>
                <div className="sl-gridwrap">
                  <div className="sl-rowlbls">{ROW_LABELS.map(l => <span key={l}>{l}</span>)}</div>
                  <div className="sl-zg">
                    {cells.map(x => {
                      const thin = !x.ok, isSel = !!shown && shown[0] === x.r && shown[1] === x.c, t = tone(x.dv ?? 0)
                      const label = `${cellName(x.r, x.c)}. ${thin ? `Only ${x.n} pitches, not estimated` : `Decision runs ${sgn(x.dv ?? 0)} per 100, ${x.n} pitches`}`
                      return (
                        <button key={`${x.r}-${x.c}`} type="button" aria-label={label} aria-pressed={isSel} onClick={() => setSel([x.r, x.c])}
                          className={`sl-cell${inZone(x.r, x.c) ? ' sl-inz' : ''}${thin ? ' sl-hatch' : ''}${isSel ? ' sl-sel' : ''}`}
                          style={thin ? undefined : { background: t.bg, color: t.fg }}>
                          <b>{thin ? `n=${x.n}` : sgn(x.dv ?? 0)}</b>{!thin && <small>n={x.n}</small>}
                        </button>
                      )
                    })}
                  </div>
                  <div className="sl-collbls">{COL_LABELS.map(l => <span key={l}>{l}</span>)}</div>
                </div>
                <div className="sl-legend">
                  <span>Giving runs away</span><span className="sl-ramp" style={{ background: RAMP }} /><span>Better than league</span>
                  <span>(±{CAP} runs per 100 pitches, capped)</span>
                  <span><i className="sl-sw sl-swz" />Rulebook zone</span><span><i className="sl-sw sl-swh" />Under {GATE.cell} pitches: not estimated</span>
                </div>
              </Card>

              <Card title="This spot">
                {!shownCell ? <p className="sl-cap">Tap a cell to see what he did here against the league.</p> : <Detail cell={shownCell} count={count} family={family} hand={hand} />}
              </Card>
            </div>

            <Card title="The pitches behind it" style={{ marginTop: 16 }}>
              {!shownCell ? <p className="sl-cap">Tap a cell to list the pitches in it.</p>
                : !shownCell.ok ? <p className="sl-cap">{cellName(shownCell.r, shownCell.c)}: under {GATE.cell} pitches, so the list is not shown.</p>
                : pitches.status === 'loading' ? <Empty>Loading the pitches…</Empty>
                : pitches.status === 'error' ? <Empty>Couldn’t load the pitches right now.</Empty>
                : pitches.rows.length === 0 ? <Empty>No pitch-level rows came back for this spot.</Empty>
                : (
                  <>
                    <p className="sl-cap">{cellName(shownCell.r, shownCell.c)} · showing {pitches.rows.length} of {fmt(pitches.total)} pitches (most recent first), with the outcome of each.</p>
                    <div className="sl-plwrap"><table className="sl-pl"><thead><tr><th>Date</th><th>Count</th><th>Pitch</th><th>Pitcher</th><th>Location (ft)</th><th>Choice</th><th>Outcome</th></tr></thead><tbody>
                      {pitches.rows.map((p, i) => (
                        <tr key={i}><td>{p.date}</td><td>{p.count}</td><td>{p.pitch}</td><td>{p.pitcher ?? '—'} <span style={{ color: C.mute }}>({p.hand})</span></td>
                          <td>{p.x.toFixed(2)}, {p.z.toFixed(2)}</td><td style={{ fontWeight: p.swing ? 700 : 400 }}>{p.swing ? 'Swing' : 'Take'}</td><td>{p.outcome}</td></tr>
                      ))}
                    </tbody></table></div>
                  </>
                )}
              <Foot>Location is plate_x, plate_z as Savant reports them (catcher’s view); the grid itself is drawn in the batter’s frame. The list is a pitch-level request made when a cell is tapped, never part of page render.</Foot>
            </Card>

            <div className="sl-two">
              <Card title="How he wins"><p className="sl-cap">Spots where his choice beats the league’s, in this view.</p><SpotList cells={wins} tone="good" /></Card>
              <Card title="Where he’s vulnerable"><p className="sl-cap">Spots where his choice trails the league’s, in this view.</p><SpotList cells={losses} tone="bad" /></Card>
            </div>
          </>
        )}
      </Section>

      <Section id="changed" num="03" title="What changed" sub="Last 30 days against the season, all counts and pitch families, under the same minimum-pitch gates.">
        <Changed data={data} />
      </Section>

      <Section id="method" num="04" title="Method">
        <Card title="How it’s built">
          <p className="sl-cap">
            For every count group, pitch family, pitcher hand and cell of a 5×5 grid around his zone, the league’s pitches give an average run result for a swing and for a take (Savant’s <code>delta_run_exp</code>).
            A pitch is “hittable” when the league’s swing beats its take in that cell. <b>Selection</b> is the share of the other pitches he took; <b>Aggression</b> is the share of hittable pitches he swung at.
            Decision runs = (his swing rate − the league’s) × (league swing − league take), per 100 pitches. His own contact results are not in it.
          </p>
          <p className="sl-cap" style={{ marginBottom: 0 }}><b>Validation:</b> not computed yet. Split-half reliability of decision runs, and its same-season correlation with wOBA, are published here once they are run on this data. No number is shown until then.</p>
        </Card>
      </Section>

      <Foot>
 Method: league run result of swing vs take by count × location cell × pitch family × pitcher hand; decision runs = his choice minus the cell’s average, per 100 pitches.
        Cells under {GATE.cell} pitches are hatched. Minimums: {GATE.season} pitches for the season view, {GATE.group} per count group. Only {data.season}-era plate locations are used; eras are never mixed.
        0-1 counts appear on the count ladder only. Inspired by Baseball Prospectus’s SEAGER framework; not a replica.
      </Foot>
    </div>
  )
}

function Seg<T extends string>({ items, cur, on }: { items: { key: T; label: string }[]; cur: T; on: (k: T) => void }) {
  return (
    <div className="sl-seg" role="group">
      {items.map(i => <button key={i.key} type="button" aria-pressed={i.key === cur} className={i.key === cur ? 'on' : ''} onClick={() => on(i.key)}>{i.label}</button>)}
    </div>
  )
}

function SpotList({ cells, tone }: { cells: { r: number; c: number; n: number; dv: number | null }[]; tone: 'good' | 'bad' }) {
  if (cells.length === 0) return <p style={{ color: C.mute, fontSize: 13, margin: 0 }}>No spot with enough pitches in this view.</p>
  return (
    <ul className="sl-list">
      {cells.map(x => (
        <li key={`${x.r}-${x.c}`}><span>{cellName(x.r, x.c)}<em>n={x.n}</em></span><b style={{ color: tone === 'good' ? C.good : C.bad }}>{sgn(x.dv ?? 0)}</b></li>
      ))}
    </ul>
  )
}

function Detail({ cell, count, family, hand }: { cell: ReturnType<typeof cellsFor>[number]; count: CountGroup; family: Family; hand: HandFilter }) {
  const z = inZone(cell.r, cell.c)
  const where = `${z ? 'Inside the rulebook zone' : 'Outside the rulebook zone'} · ${famLabel(family)} · ${COUNT_GROUPS.find(k => k.key === count)!.label.toLowerCase()} counts · ${handLabel(hand)}`
  if (!cell.ok || cell.swing == null || cell.lg == null || cell.dv == null || cell.gap == null) {
    return (
      <>
        <h4 className="sl-h4">{cellName(cell.r, cell.c)}</h4><div className="sl-where">{where}</div>
        <div style={{ textAlign: 'center', padding: '18px 8px' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Not estimated (n = {cell.n} of {GATE.cell} needed)</div>
          <div style={{ color: C.mute, fontSize: 13 }}>Too few pitches in this spot to say what the choice was worth.</div>
        </div>
      </>
    )
  }
  const diff = Math.round((cell.swing - cell.lg) * 100)
  return (
    <>
      <h4 className="sl-h4">{cellName(cell.r, cell.c)}</h4><div className="sl-where">{where}</div>
      <div className="sl-dv"><b style={{ color: cell.dv >= 0 ? C.good : C.bad }}>{sgn(cell.dv)}</b><span>decision runs per 100 pitches, against the league’s average choice</span></div>
      <table className="sl-rows"><tbody>
        <tr><td>Pitches seen</td><td>{fmt(cell.n)}</td></tr>
        <tr><td>He swung at</td><td>{pct(cell.swing)}</td></tr>
        <tr><td>League swings at</td><td>{pct(cell.lg)} <small>({diff === 0 ? 'level' : `${sgn(diff, 0)} pts for him`})</small></td></tr>
        <tr><td>League: a swing here vs a take<br /><small>runs per 100 pitches</small></td><td>{sgn(cell.gap)}</td></tr>
      </tbody></table>
      <p className="sl-sent">He swung at {pct(cell.swing)} of the {fmt(cell.n)} {famLabel(family)} he saw here; the league swings at {pct(cell.lg)}. Across the league, a swing in this spot has been worth {sgn(cell.gap)} runs per 100 pitches {cell.gap >= 0 ? 'more' : 'less'} than a take.</p>
    </>
  )
}

function Changed({ data }: { data: SwingLabData }) {
  const idx = useMemo(() => leagueIndex(data.league), [data.league])
  if (data.nL30 < GATE.season) {
    return <Card><div style={{ textAlign: 'center', padding: '22px 10px' }}>
      <div style={{ fontWeight: 800, fontSize: 18 }}>Not enough pitches in the last 30 days (n = {fmt(data.nL30)} of {GATE.season} needed)</div>
      <div style={{ color: C.mute, fontSize: 13 }}>The comparison appears once the last 30 days reach the same minimum as the season view.</div>
    </div></Card>
  }
  const A = summarize(data.rows, idx), B = summarize(data.l30Rows, idx)
  const rate = (k: string, a: { n: number; swing: number | null }, b: { n: number; swing: number | null }, flip: boolean, dom: [number, number]) =>
    ({ k, na: a.n, nb: b.n, a: a.swing == null ? null : flip ? 1 - a.swing : a.swing, b: b.swing == null ? null : flip ? 1 - b.swing : b.swing, dom, rate: true })
  const defs = [
    rate('Selection', A.junk, B.junk, true, [0.3, 0.9]),
    rate('Aggression', A.hit, B.hit, false, [0.3, 0.9]),
    rate('Outside-zone take rate', A.out, B.out, true, [0.3, 0.9]),
    rate('Middle-middle swing rate', A.mid, B.mid, false, [0.3, 1]),
    { k: 'Decision runs', na: A.all.n, nb: B.all.n, a: A.all.dv, b: B.all.dv, dom: [-2, 2] as [number, number], rate: false },
  ]
  return (
    <Card title="Last 30 days vs season">
      <p className="sl-cap">Hollow dot: season. Filled dot: last 30 days. Decision runs are per 100 pitches across every spot.</p>
      {defs.map(m => {
        const low = m.nb < GATE.cell || m.na < GATE.cell || m.a == null || m.b == null
        const sub = `L30 n=${fmt(m.nb)} · season n=${fmt(m.na)}`
        if (low) return <div key={m.k} className="sl-dr"><div className="sl-dl">{m.k}<small>{sub}</small></div><div className="sl-dt" /><div className="sl-dd"><small>Not estimated</small></div></div>
        const p = (v: number) => clamp((v - m.dom[0]) / (m.dom[1] - m.dom[0]), 0, 1) * 100
        const a = p(m.a!), b = p(m.b!)
        const val = (v: number) => (m.rate ? pct(v) : `${sgn(v)} /100`)
        const delta = m.rate ? `${sgn(Math.round((m.b! - m.a!) * 100), 0)} pts` : `${sgn(m.b! - m.a!)} per 100`
        return (
          <div key={m.k} className="sl-dr"><div className="sl-dl">{m.k}<small>{sub}</small></div>
            <div className="sl-dt"><i className="sl-dline" style={{ left: `${Math.min(a, b)}%`, width: `${Math.abs(a - b)}%` }} /><i className="sl-dot sl-dots" style={{ left: `${a}%` }} /><i className="sl-dot sl-dotn" style={{ left: `${b}%` }} /></div>
            <div className="sl-dd"><b>{val(m.b!)}</b> <small>from {val(m.a!)} · {delta}</small></div></div>
        )
      })}
      <Foot>Same method and minimums as the season view. “Last 30 days” ends on the last game day in the data.</Foot>
    </Card>
  )
}

const SWING_CSS = `
.sl-bars{display:flex;gap:26px;flex-wrap:wrap;margin:6px 0 0}
.sl-lbl{font-size:10px;letter-spacing:.14em;font-weight:700;color:${C.orange};text-transform:uppercase;margin-bottom:6px}
.sl-defn{font-size:11px;color:${C.mute};margin-top:5px}
.sl-seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.sl-seg button{border:1px solid ${C.line};background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;color:${C.ink}}
.sl-seg button.on{background:${C.ink};color:#fff;border-color:${C.ink}}
.sl-seg button:focus-visible,.sl-cell:focus-visible{outline:2px solid ${C.orange};outline-offset:2px}
.sl-tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.sl-cap{color:#5b5347;font-size:13px;margin:0 0 12px}
.sl-lab{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:start}
.sl-gridwrap{display:grid;grid-template-columns:auto 1fr;gap:6px}
.sl-rowlbls{display:grid;grid-template-rows:repeat(5,1fr);gap:4px}
.sl-rowlbls span,.sl-collbls span{font-size:10px;letter-spacing:.08em;font-weight:600;color:${C.faint};text-transform:uppercase;display:flex;align-items:center}
.sl-rowlbls span{justify-content:flex-end;padding-right:4px;max-width:54px;text-align:right;line-height:1.1}
.sl-collbls{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;grid-column:2}
.sl-collbls span{justify-content:center;text-align:center;line-height:1.1}
.sl-zg{display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:4px}
.sl-cell{aspect-ratio:1/1;border:1px solid transparent;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:2px;min-width:0;cursor:pointer;font-family:inherit}
.sl-cell b{font-size:clamp(13px,2.1vw,20px);font-weight:800;line-height:1}
.sl-cell small{font-size:clamp(9px,1.2vw,11px);font-weight:600;opacity:.8}
.sl-cell.sl-inz{border:2px solid ${C.ink}}
.sl-cell.sl-sel{box-shadow:0 0 0 3px ${C.yellow},0 0 0 5px ${C.ink}}
.sl-cell.sl-hatch{background:repeating-linear-gradient(135deg,#f7f4ec 0 6px,#e7e2d8 6px 7px);color:${C.faint}}
.sl-cell.sl-hatch b{font-size:clamp(11px,1.5vw,14px);font-weight:700}
.sl-legend{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:${C.mute}}
.sl-ramp{display:inline-flex;height:10px;width:170px;border-radius:5px;border:1px solid ${C.line}}
.sl-sw{display:inline-block;width:16px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px}
.sl-swh{background:repeating-linear-gradient(135deg,#f7f4ec 0 4px,#d9d3c4 4px 5px)}
.sl-swz{border:2px solid ${C.ink};background:#fff}
.sl-h4{margin:0 0 2px;font-size:22px;font-weight:800;letter-spacing:-.01em}
.sl-where{font-size:12px;color:${C.mute};margin-bottom:12px}
.sl-dv{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
.sl-dv b{font-size:40px;font-weight:800;line-height:1}
.sl-dv span{font-size:12px;color:${C.mute}}
.sl-rows{width:100%;border-collapse:collapse;font-size:13px}
.sl-rows td{padding:7px 0;border-top:1px solid ${C.line}}
.sl-rows td:last-child{text-align:right;font-weight:700}
.sl-rows small{font-weight:500;color:${C.mute}}
.sl-sent{margin:12px 0 0;color:#5b5347;font-size:13px}
.sl-two{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
.sl-list{list-style:none;margin:0;padding:0}
.sl-list li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid ${C.line};font-size:13px}
.sl-list li:first-child{border-top:0}
.sl-list li span{color:#5b5347}
.sl-list li b{white-space:nowrap}
.sl-list li em{font-style:normal;color:${C.mute};font-weight:500;font-size:11px;margin-left:5px}
.sl-plwrap{max-height:340px;overflow:auto;border:1px solid ${C.line};border-radius:10px}
.sl-pl{width:100%;border-collapse:collapse;font-size:12.5px}
.sl-pl th{position:sticky;top:0;background:${C.soft};text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:${C.mute};padding:7px 10px;font-weight:700}
.sl-pl td{padding:6px 10px;border-top:1px solid ${C.line};white-space:nowrap}
.sl-lr{display:grid;grid-template-columns:44px 1fr 250px;gap:10px;align-items:center;padding:5px 0}
.sl-ll{font-weight:800;font-size:14px}
.sl-lt{position:relative;height:16px;background:${C.soft};border-radius:8px;overflow:hidden}
.sl-lb{position:absolute;left:0;top:0;bottom:0;background:${C.ink};border-radius:8px}
.sl-lb.sl-thin{background:repeating-linear-gradient(135deg,#d9d3c4 0 4px,#efe9dc 4px 5px)}
.sl-lk{position:absolute;top:0;bottom:0;width:3px;background:${C.orange};transform:translateX(-1px)}
.sl-lv{font-size:13px;white-space:nowrap}
.sl-lv em{font-style:normal;color:${C.mute};font-size:11px;margin-left:4px}
.sl-sep{border-top:1px dashed ${C.line};margin:4px 0}
.sl-dr{display:grid;grid-template-columns:190px 1fr 210px;gap:14px;align-items:center;padding:10px 0;border-top:1px solid ${C.line}}
.sl-dl{font-weight:700;font-size:13px}
.sl-dl small{display:block;font-weight:500;color:${C.mute};font-size:11px}
.sl-dt{position:relative;height:22px}
.sl-dt::before{content:"";position:absolute;left:0;right:0;top:10px;height:2px;background:${C.soft}}
.sl-dline{position:absolute;top:9px;height:4px;background:${C.ink};opacity:.35;border-radius:2px}
.sl-dot{position:absolute;top:3px;width:16px;height:16px;border-radius:50%;transform:translateX(-8px);border:2.5px solid ${C.ink}}
.sl-dots{background:#fff}.sl-dotn{background:${C.ink}}
.sl-dd{font-size:13px;white-space:nowrap}
.sl-dd small{color:${C.mute};font-size:11px}
@media(max-width:900px){
  .sl-lab,.sl-two{grid-template-columns:1fr}.sl-tiles{grid-template-columns:1fr 1fr}
  .sl-lr{grid-template-columns:40px 1fr}.sl-lr .sl-lv{grid-column:1/-1;padding-left:50px;white-space:normal}
  .sl-dr{grid-template-columns:1fr;gap:6px}
}
`
