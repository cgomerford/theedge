// src/lib/graphics/situations.ts
//
// The situations a team's batting or pitching can be filtered to in the admin chart builder ("with two strikes", "runners in scoring position", "against breaking balls").
// Pure and shared: the page shows these options, the server turns the chosen ones into Baseball Savant search parameters. Only the values listed here ever reach
// Savant, so a request cannot inject a parameter of its own. The count code is balls then strikes (02 is a 0-2 count); the base codes are Savant's own (0 empty, 4 any
// runner on, 5 runner in scoring position).

export type SitFilters = { count: string; outs: string; runners: string; pitch: string; pthrow: string; stand: string; venue: string; inn: string; zone: string; gt: string }
export const SIT_DEFAULT: SitFilters = { count: 'any', outs: 'any', runners: 'any', pitch: 'any', pthrow: 'any', stand: 'any', venue: 'any', inn: 'any', zone: 'any', gt: 'R' }

type Opt = { id: string; label: string; v: string }
const any = (label: string): Opt => ({ id: 'any', label, v: '' })

export const SIT_OPTIONS: Record<keyof SitFilters, { label: string; param: string; options: Opt[] }> = {
  count: {
    label: 'Count', param: 'hfC', options: [
      any('Any count'),
      { id: '2k', label: 'Two strikes', v: '02|12|22|' }, { id: '0k', label: 'No strikes', v: '00|10|20|30|' }, { id: '1k', label: 'One strike', v: '01|11|21|31|' },
      { id: 'ahead', label: 'Hitter ahead (1-0, 2-0, 2-1, 3-0, 3-1)', v: '10|20|21|30|31|' }, { id: 'behind', label: 'Pitcher ahead (0-1, 0-2, 1-2)', v: '01|02|12|' },
      { id: 'even', label: 'Even (0-0, 1-1, 2-2)', v: '00|11|22|' }, { id: '3b', label: 'Three balls', v: '30|31|32|' },
      ...['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2', '3-0', '3-1', '3-2'].map(c => ({ id: c, label: `${c} count`, v: `${c.replace('-', '')}|` })),
    ],
  },
  outs: { label: 'Outs', param: 'hfOuts', options: [any('Any number of outs'), { id: '0', label: 'No outs', v: '0|' }, { id: '1', label: 'One out', v: '1|' }, { id: '2', label: 'Two outs', v: '2|' }] },
  runners: {
    label: 'Runners', param: 'hfRO', options: [any('Any base state'), { id: 'empty', label: 'Bases empty', v: '0|' }, { id: 'on', label: 'Runners on', v: '4|' }, { id: 'risp', label: 'Runners in scoring position', v: '5|' },
      { id: 'first', label: 'Runner on first', v: '1|' }, { id: 'second', label: 'Runner on second', v: '2|' }, { id: 'third', label: 'Runner on third', v: '3|' }],
  },
  pitch: {
    label: 'Pitch type', param: 'hfPT', options: [any('Any pitch'),
      { id: 'fast', label: 'Fastballs (four-seam, sinker, cutter)', v: 'FF|SI|FC|' }, { id: 'brk', label: 'Breaking balls (slider, sweeper, curve, slurve)', v: 'SL|ST|CU|KC|SV|CS|' }, { id: 'off', label: 'Offspeed (changeup, splitter)', v: 'CH|FS|FO|SC|' },
      { id: 'FF', label: 'Four-seam fastballs', v: 'FF|' }, { id: 'SI', label: 'Sinkers', v: 'SI|' }, { id: 'FC', label: 'Cutters', v: 'FC|' }, { id: 'SL', label: 'Sliders', v: 'SL|' }, { id: 'ST', label: 'Sweepers', v: 'ST|' },
      { id: 'CU', label: 'Curveballs', v: 'CU|' }, { id: 'CH', label: 'Changeups', v: 'CH|' }, { id: 'FS', label: 'Splitters', v: 'FS|' }],
  },
  pthrow: { label: 'Pitcher throws', param: 'pitcher_throws', options: [any('Either hand'), { id: 'L', label: 'Left-handed pitchers', v: 'L' }, { id: 'R', label: 'Right-handed pitchers', v: 'R' }] },
  stand: { label: 'Batter stands', param: 'batter_stands', options: [any('Either side'), { id: 'L', label: 'Left-handed batters', v: 'L' }, { id: 'R', label: 'Right-handed batters', v: 'R' }] },
  venue: { label: 'Home or road', param: 'home_road', options: [any('Home and road'), { id: 'Home', label: 'Home games', v: 'Home' }, { id: 'Road', label: 'Road games', v: 'Road' }] },
  inn: {
    label: 'Innings', param: 'hfInn', options: [any('Any inning'), { id: 'early', label: 'Innings 1 to 3', v: '1|2|3|' }, { id: 'mid', label: 'Innings 4 to 6', v: '4|5|6|' }, { id: 'late', label: 'Innings 7 to 9', v: '7|8|9|' }, { id: 'extra', label: 'Extra innings', v: '10|11|12|13|14|15|16|' }],
  },
  zone: {
    label: 'Pitch location', param: 'hfZ', options: [any('Anywhere'), { id: 'in', label: 'In the strike zone', v: '1|2|3|4|5|6|7|8|9|' }, { id: 'out', label: 'Outside the zone (chase area)', v: '11|12|13|14|' }, { id: 'heart', label: 'Heart of the zone', v: '5|' }],
  },
  gt: { label: 'Games', param: 'hfGT', options: [{ id: 'R', label: 'Regular season', v: 'R|' }, { id: 'PO', label: 'Postseason', v: 'F|D|L|W|' }, { id: 'ALL', label: 'Regular season and postseason', v: 'R|F|D|L|W|' }] },
}

/** Keeps only known ids. Anything else becomes the default for that filter. */
export function cleanSit(x: unknown): SitFilters {
  const o = (typeof x === 'object' && x ? x : {}) as Record<string, unknown>
  const out = { ...SIT_DEFAULT }
  for (const k of Object.keys(SIT_OPTIONS) as (keyof SitFilters)[]) {
    const v = typeof o[k] === 'string' ? (o[k] as string) : ''
    if (SIT_OPTIONS[k].options.some(opt => opt.id === v)) out[k] = v
  }
  return out
}

/** The Savant search query fragment (already URL-encoded, starting with &) for a set of filters. */
export function savantParams(f: SitFilters): string {
  let q = ''
  for (const k of Object.keys(SIT_OPTIONS) as (keyof SitFilters)[]) {
    const opt = SIT_OPTIONS[k].options.find(o => o.id === f[k])
    if (opt && opt.v) q += `&${SIT_OPTIONS[k].param}=${encodeURIComponent(opt.v)}`
  }
  return q
}

const SHORT: Partial<Record<keyof SitFilters, (o: Opt) => string>> = {
  count: o => (o.id === '2k' ? 'with two strikes' : o.id === 'ahead' ? 'when the hitter is ahead in the count' : o.id === 'behind' ? 'when the pitcher is ahead in the count' : o.id === 'even' ? 'in even counts' : o.id === '3b' ? 'with three balls' : o.id === '0k' ? 'with no strikes' : o.id === '1k' ? 'with one strike' : `in ${o.id} counts`),
  outs: o => `with ${o.label.toLowerCase()}`, runners: o => (o.id === 'empty' ? 'with the bases empty' : o.id === 'on' ? 'with runners on' : o.id === 'risp' ? 'with runners in scoring position' : `with a ${o.label.toLowerCase()}`),
  pitch: o => `against ${o.label.replace(/ \(.*\)/, '').toLowerCase()}`, pthrow: o => `against ${o.label.toLowerCase()}`, stand: o => `by ${o.label.toLowerCase()}`, venue: o => `in ${o.label.toLowerCase()}`,
  inn: o => `in ${o.label.toLowerCase()}`, zone: o => `on pitches ${o.id === 'in' ? 'in the strike zone' : o.id === 'out' ? 'outside the zone' : 'down the middle'}`,
}
/** "with two strikes, with runners in scoring position": the situation in words, empty for no filter. */
export function describeSit(f: SitFilters): string {
  const parts: string[] = []
  for (const k of ['count', 'outs', 'runners', 'pitch', 'pthrow', 'stand', 'venue', 'inn', 'zone'] as const) {
    const opt = SIT_OPTIONS[k].options.find(o => o.id === f[k])
    if (opt && opt.id !== 'any') parts.push(SHORT[k]!(opt))
  }
  if (f.gt === 'PO') parts.push('in the postseason'); else if (f.gt === 'ALL') parts.push('in the regular season and postseason')
  return parts.join(', ')
}

/** Ready-made situations for the buttons above the filters. */
export const SIT_PRESETS: { label: string; set: Partial<SitFilters> }[] = [
  { label: 'Two strikes', set: { count: '2k' } },
  { label: 'Runners in scoring position', set: { runners: 'risp' } },
  { label: 'Two outs', set: { outs: '2' } },
  { label: 'Late innings', set: { inn: 'late' } },
  { label: 'Hitter ahead', set: { count: 'ahead' } },
  { label: 'Full count', set: { count: '3-2' } },
  { label: 'Two strikes, scoring position', set: { count: '2k', runners: 'risp' } },
  { label: 'Two strikes vs breaking balls', set: { count: '2k', pitch: 'brk' } },
]

/** A joined table can carry its own situation: `tsit-bat@count=2k;pitch=brk` is team batting with two strikes against breaking balls. A plain id has none. */
export function splitExtra(id: string): { dataset: string; sit: SitFilters | null } {
  const [dataset, spec] = id.split('@')
  if (!spec) return { dataset, sit: null }
  const o: Record<string, string> = {}
  for (const kv of spec.split(';')) { const [k, v] = kv.split('='); if (k && v) o[k] = v }
  return { dataset, sit: cleanSit(o) }
}
