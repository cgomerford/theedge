'use client'

// src/components/stats/queryOutput.tsx
//
// The "answer first" controls for Ask the Stats:
//   AskCard      – after a search, asks WHAT output (just the answer / table / chart /
//                  full report) and WHICH metrics before showing anything.
//   OutputBar    – the same two choices, always visible afterwards, so a result can be
//                  widened ("add stolen bases") without starting over.
//   MetricPicker – chips for the chosen metrics + an "add metric" menu.
//   DeepPanel    – stackable filters (pitch count, inning range, score margin, and any
//                  mix of situation chips) for the plate-appearance engine.
//
// Only metrics the current data source can really compute are ever offered — if a stat
// isn't available (e.g. pitch-type mix) it is simply not in the list.

import { C, SANS, MONO } from '@/components/team/ui'
import { Chip, Field, Hint, ProLockBar, Seg, labelStyle, selectStyle } from '@/components/stats/queryUi'
import { WhoFilter } from '@/components/stats/queryWho'
import { HitFields } from '@/components/stats/queryHit'
import {
  deepSupports, describeDeep, isStandardMetric, metricByKey, metricsFor, splitLabel, familySplits,
  type DeepFilters, type Group, type SplitFamily,
} from '@/lib/stats-query-catalog'

export type Output = 'answer' | 'table' | 'chart' | 'full'

export const OUTPUTS: { key: Output; label: string; blurb: string }[] = [
  { key: 'answer', label: 'Just the answer', blurb: 'Big numbers for the metrics you choose — nothing else' },
  { key: 'table', label: 'Table', blurb: 'A clean table; expand it to teams, seasons or players' },
  { key: 'chart', label: 'Chart', blurb: 'A graphic for the first metric' },
  { key: 'full', label: 'Full report', blurb: 'Tiles, charts and tables together' },
]

/** Quick-add suggestions by side of the ball. */
const SUGGESTED: Record<Group, string[]> = {
  hitting: ['avg', 'obp', 'slg', 'ops', 'hr', 'sb', 'so', 'bb'],
  pitching: ['era', 'whip', 'k9', 'bb9', 'p_so', 'opp_avg', 'w', 'sv'],
  fielding: ['fpct', 'e', 'dp', 'ast', 'po'],
}

// ── metric chips + add menu ─────────────────────────────────────────────

export function MetricPicker({
  group, chosen, onChange, isPro, available,
}: {
  group: Group
  chosen: string[]
  onChange: (next: string[]) => void
  isPro: boolean
  /** metrics the current data source can compute (the deep engine supports fewer) */
  available: (key: string) => boolean
}) {
  const all = metricsFor(group).filter(m => available(m.key))
  const addable = all.filter(m => !chosen.includes(m.key))
  const std = addable.filter(m => isStandardMetric(m.key))
  const adv = addable.filter(m => !isStandardMetric(m.key))
  const quick = SUGGESTED[group].filter(k => available(k) && !chosen.includes(k) && (isPro || isStandardMetric(k))).slice(0, 6)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {chosen.map((k, i) => {
          const m = metricByKey(k)
          if (!m) return null
          return (
            <span key={k} title={i === 0 ? `${m.full} — first metric (used for charts and sorting)` : `${m.full} — click to make it the chart metric`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontWeight: 800, fontSize: 12.5, padding: '4px 5px 4px 10px', borderRadius: 4,
                background: i === 0 ? C.orange : C.ink, color: '#fff',
              }}>
              <button type="button" onClick={() => i > 0 && onChange([k, ...chosen.filter(x => x !== k)])}
                style={{ all: 'unset', cursor: i > 0 ? 'pointer' : 'default' }}>{m.label}{i === 0 ? ' ★' : ''}</button>
              {chosen.length > 1 && (
                <button type="button" aria-label={`Remove ${m.label}`} onClick={() => onChange(chosen.filter(x => x !== k))}
                  style={{ all: 'unset', cursor: 'pointer', width: 18, height: 18, borderRadius: 3, background: 'rgba(255,255,255,.25)', textAlign: 'center', lineHeight: '18px', fontSize: 11 }}>✕</button>
              )}
            </span>
          )
        })}
        <select aria-label="More metrics" value="" style={{ ...selectStyle, width: 'auto', padding: '5px 8px', fontSize: 13 }}
          onChange={e => { if (e.target.value) onChange([...chosen, e.target.value]) }}>
          <option value="">+ More metrics</option>
          <optgroup label="Standard">{std.map(m => <option key={m.key} value={m.key}>{m.label} — {m.full}</option>)}</optgroup>
          {adv.length > 0 && (
            <optgroup label={isPro ? 'Advanced' : 'Advanced — Pro'}>
              {adv.map(m => <option key={m.key} value={m.key} disabled={!isPro}>{m.label} — {m.full}</option>)}
            </optgroup>
          )}
        </select>
      </div>
      {quick.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: C.faint }}>Quick extras</span>
          {quick.map(k => (
            <button key={k} type="button" onClick={() => onChange([...chosen, k])} title={metricByKey(k)?.full}
              style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '3px 8px', borderRadius: 4, border: `1px dashed ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer' }}>
              + {metricByKey(k)?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── the first question ──────────────────────────────────────────────────

export type RankedAsk = {
  sortKey: string | null
  sortAsc: boolean | null
  onSort: (key: string | null, asc: boolean | null) => void
  limit: number
  onLimit: (n: number) => void
  /** what the table is made of, e.g. "players" or "clubs" */
  noun: string
}

export function AskCard({
  output, onOutput, chosen, onChosen, group, isPro, available, heard, onShow, ranked,
}: {
  output: Output
  onOutput: (o: Output) => void
  chosen: string[]
  onChosen: (c: string[]) => void
  group: Group
  isPro: boolean
  available: (key: string) => boolean
  heard: string[]
  onShow: () => void
  /** set for the Team / Player tables: also asks how to sort and how many rows */
  ranked?: RankedAsk
}) {
  const first = chosen[0]
  const sortKey = ranked ? (ranked.sortKey && chosen.includes(ranked.sortKey) ? ranked.sortKey : first) : first
  const sortMetric = metricByKey(sortKey)
  const asc = ranked?.sortAsc ?? (sortMetric ? !sortMetric.sortDesc : false)
  return (
    <div style={{ background: '#fff', border: `2px solid ${C.orange}`, borderRadius: 8, padding: 18, marginBottom: 14 }}>
      <div style={{ ...labelStyle, marginBottom: 2 }}>⊕ {ranked ? 'Before we build the table' : 'Before we show it'}</div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em' }}>{ranked ? `How should the ${ranked.noun} table look?` : 'How do you want to see this?'}</div>
      {heard.length > 0 && <div style={{ fontFamily: SANS, fontSize: 13, color: C.mute, margin: '2px 0 12px' }}>Searching for: {heard.join(' · ')}</div>}

      <div style={{ ...labelStyle, marginTop: 10 }}>1 · Output</div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {OUTPUTS.map(o => (
          <button key={o.key} type="button" onClick={() => onOutput(o.key)}
            style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: SANS,
              border: `1.5px solid ${output === o.key ? C.ink : C.line}`, background: output === o.key ? '#fff1ec' : '#fff', color: C.ink,
            }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{o.label}</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{o.blurb}</div>
          </button>
        ))}
      </div>

      <div style={{ ...labelStyle, marginTop: 14 }}>2 · Metrics to include</div>
      <MetricPicker group={group} chosen={chosen} onChange={onChosen} isPro={isPro} available={available} />

      {ranked && (
        <>
          <div style={{ ...labelStyle, marginTop: 14 }}>3 · Sort by</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="Sort by" style={{ ...selectStyle, width: 'auto', minWidth: 200 }} value={sortKey}
              onChange={e => ranked.onSort(e.target.value, null)}>
              {chosen.map(k => <option key={k} value={k}>{metricByKey(k)?.label} — {metricByKey(k)?.full}</option>)}
            </select>
            <div style={{ minWidth: 240 }}>
              <Seg<'desc' | 'asc'> value={asc ? 'asc' : 'desc'} onChange={v => ranked.onSort(sortKey, v === 'asc')}
                options={[{ key: 'desc', label: 'High → low' }, { key: 'asc', label: 'Low → high' }]} />
            </div>
          </div>
          <div style={{ ...labelStyle, marginTop: 14 }}>4 · How many rows</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[10, 25, 50, 100, 0].map(n => <Chip key={n} on={ranked.limit === n} solid onClick={() => ranked.onLimit(n)}>{n === 0 ? 'All' : `Top ${n}`}</Chip>)}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.faint, marginTop: 8 }}>
            Every row can be opened afterwards: {ranked.noun === 'clubs' ? 'club → players → games → ' : 'player → games → '}{group === 'pitching' ? 'every pitch' : 'every plate appearance'}.
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" onClick={onShow}
          style={{ fontFamily: SANS, fontWeight: 800, fontSize: 14, padding: '10px 22px', border: 'none', borderRadius: 5, background: C.orange, color: '#fff', cursor: 'pointer' }}>
          {ranked ? 'Build the table' : 'Show results'}
        </button>
        <span style={{ fontFamily: SANS, fontSize: 12, color: C.faint }}>You can widen it afterwards — include teams, seasons, or more metrics.</span>
      </div>
    </div>
  )
}

// ── always-visible version ──────────────────────────────────────────────

export function OutputBar({
  output, onOutput, chosen, onChosen, group, isPro, available,
}: {
  output: Output
  onOutput: (o: Output) => void
  chosen: string[]
  onChosen: (c: string[]) => void
  group: Group
  isPro: boolean
  available: (key: string) => boolean
}) {
  return (
    <div data-noexport="1" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...labelStyle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>Show it as <Hint text="Just the answer = big numbers only. Table = rows you can sort and open. Chart = a graphic. Full report = all of them." /></span>
        {OUTPUTS.map(o => <Chip key={o.key} on={output === o.key} solid onClick={() => onOutput(o.key)} title={o.blurb}>{o.label}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{ ...labelStyle, marginBottom: 0, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>Stats <Hint text="The numbers to show. The ★ one drives charts and sorting — click another to make it the star. Use “+ More metrics” to include as many as you like." /></span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <MetricPicker group={group} chosen={chosen} onChange={onChosen} isPro={isPro} available={available} />
        </div>
      </div>
    </div>
  )
}

// ── stackable filters (plate-appearance engine) ─────────────────────────

const INNINGS = Array.from({ length: 12 }, (_, i) => i + 1)

export function DeepPanel({
  deep, onChange, group, families, isPro, coverage, parts = ['numbers', 'who', 'hit', 'stack', 'summary'],
}: {
  deep: DeepFilters
  onChange: (d: DeepFilters) => void
  group: Group
  families: SplitFamily[]
  isPro: boolean
  coverage?: string
  /** which blocks to show — the grouped Pro search renders each block in its own section */
  parts?: ('numbers' | 'who' | 'hit' | 'stack' | 'summary')[]
}) {
  const has = (p: string) => (parts as string[]).includes(p)
  if (!isPro) {
    return <ProLockBar features={['Stack any filters together (e.g. 7th inning+ and runners in scoring position and 8+ pitch at-bats)', 'Pitch count, inning range, score margin']} />
  }
  const usable = families.filter(f => familySplits(f, group).some(s => deepSupports(s.code, group)))
  const stackIn = (famCodes: string[]) => deep.stack.find(c => famCodes.includes(c))
  const toggle = (code: string, famCodes: string[]) => {
    const without = deep.stack.filter(c => !famCodes.includes(c))
    onChange({ ...deep, stack: deep.stack.includes(code) ? without : [...without, code] })
  }
  const num = (v: string): number | undefined => (v === '' ? undefined : Number(v))
  const active = describeDeep(deep)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {has('numbers') && <div className="ql-grid">
        <Field label="At-bat length — at least (pitches)">
          <input type="number" min={1} max={30} style={selectStyle} value={deep.pitchesMin ?? ''} placeholder="any"
            onChange={e => onChange({ ...deep, pitchesMin: num(e.target.value) })} />
        </Field>
        <Field label="At-bat length — at most (pitches)">
          <input type="number" min={1} max={30} style={selectStyle} value={deep.pitchesMax ?? ''} placeholder="any"
            onChange={e => onChange({ ...deep, pitchesMax: num(e.target.value) })} />
        </Field>
        <Field label="From inning">
          <select style={selectStyle} value={deep.inningFrom ?? ''} onChange={e => onChange({ ...deep, inningFrom: num(e.target.value) })}>
            <option value="">any</option>{INNINGS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Through inning">
          <select style={selectStyle} value={deep.inningTo ?? ''} onChange={e => onChange({ ...deep, inningTo: num(e.target.value) })}>
            <option value="">any</option>{INNINGS.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Score margin — from (− = trailing)">
          <input type="number" min={-30} max={30} style={selectStyle} value={deep.scoreMin ?? ''} placeholder="any"
            onChange={e => onChange({ ...deep, scoreMin: num(e.target.value) })} />
        </Field>
        <Field label="Score margin — to (+ = leading)">
          <input type="number" min={-30} max={30} style={selectStyle} value={deep.scoreMax ?? ''} placeholder="any"
            onChange={e => onChange({ ...deep, scoreMax: num(e.target.value) })} />
        </Field>
      </div>}

      {has('who') && <WhoFilter who={deep.who} onChange={w => onChange({ ...deep, who: w })} />}

      {has('hit') && <div>
        <div style={{ ...labelStyle, display: 'flex', gap: 6, alignItems: 'center' }}>⊕ The batted ball <Hint text="Search by how the ball was hit: exit velocity, launch angle, distance and kind of contact — plus the result. Tip: open any result row and use “Find hits like this” to begin from a real hit." /></div>
        <HitFields deep={deep} onChange={onChange} />
      </div>}

      {has('stack') && <div>
        <div style={labelStyle}>⊕ Stack situations <span style={{ color: C.mute, letterSpacing: 0, textTransform: 'none', fontSize: 12 }}>— one from each group; they all apply together</span></div>
        {usable.map(f => {
          const defs = familySplits(f, group).filter(s => deepSupports(s.code, group))
          const codes = defs.map(d => d.code)
          const picked = stackIn(codes)
          return (
            <div key={f.key} style={{ margin: '8px 0' }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: picked ? C.ink : C.faint, marginBottom: 4 }}>{f.label}{picked ? ` · ${splitLabel(picked)}` : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {defs.map(d => <Chip key={d.code} on={deep.stack.includes(d.code)} onClick={() => toggle(d.code, codes)}>{d.label}</Chip>)}
              </div>
            </div>
          )
        })}
      </div>}

      {has('summary') && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SANS, fontSize: 13, color: C.ink }}>
          {active.length ? <>Active: <b>{active.join(' + ')}</b></> : 'No stacked filters yet — choose some above.'}
        </span>
        {active.length > 0 && (
          <button type="button" onClick={() => onChange({ stack: [] })}
            style={{ fontFamily: SANS, fontSize: 12, border: 'none', background: 'transparent', color: C.orange, cursor: 'pointer', fontWeight: 700 }}>Clear all</button>
        )}
      </div>}
      {has('summary') && coverage && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{coverage}</div>}
    </div>
  )
}
