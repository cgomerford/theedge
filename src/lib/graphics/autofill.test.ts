import { describe, expect, it } from 'vitest'
import { buildAttackSpec, buildCollisionSpec, buildPitcherSpec, buildScoreboardSpec, pitchLine, surname, type AttackTeam, type PitcherInput } from './autofill'
import { validateSpec } from './schema'

const zone = (swings: number, whiffs: number, woba: number | null, bb: number) => ({ swings, whiffs, woba_against: woba, batted_balls: bb })
const arsenal = {
  player_id: 1, player_name: 'A B', team_id: 139, season: 2026, split: 'all', total_pitches: 100,
  arsenal: { SI: { pitch_name: 'Sinker', usage_pct: 60, avg_velo: 92.44, total_pitches: 60, zones: { '1': zone(30, 3, 0.3, 10), '2': zone(10, 1, 0.4, 10) } } },
} as never

// Rows exactly as the Scout Report reads them from pitch_arsenals (Martinez, 2026).
const scoutArsenal = [
  { pitch_type: 'SI', pitch_name: 'Sinker', percentage: 31.72, count: 800, avg_velocity: 92.6, whiff_percent: 9.3, put_away_percent: 19.4, est_woba: 0.336, hard_hit_percent: 37.5, ba_against: 0.277 },
  { pitch_type: 'CH', pitch_name: 'Changeup', percentage: 25.81, count: 651, avg_velocity: 78.1, whiff_percent: 30.7, put_away_percent: 16.9, est_woba: 0.241, hard_hit_percent: 23.2, ba_against: 0.184 },
  { pitch_type: 'FF', pitch_name: '4-Seam Fastball', percentage: 12.57, count: 317, avg_velocity: 93, whiff_percent: null, put_away_percent: 12.3, est_woba: 0.307, hard_hit_percent: 43.3, ba_against: 0.253 },
  { pitch_type: 'EP', pitch_name: 'Eephus', percentage: 1, count: 3, avg_velocity: 60, whiff_percent: 0, put_away_percent: 0, est_woba: null, hard_hit_percent: null, ba_against: null },
]

const pitcher = (over: Partial<PitcherInput> = {}): PitcherInput => ({
  id: 1, name: 'Alex Bee', throws: 'R', teamAbbr: 'TB', oppAbbr: 'MIL',
  stats: { era: 3.1, whip: 1.09, fip: 3.96, k_per_9: 5.45, bb_per_9: 1.3, l3_era: null, tto1_woba: 0.272, tto2_woba: 0.293, tto3_woba: 0.351, tto1_avg: null, tto2_avg: null, tto3_avg: null, tto1_pa: 282, tto2_pa: null, tto3_pa: null, tto_verified_at: null },
  scoutArsenal, arsenal, ...over,
})

describe('pitchLine', () => {
  it('computes whiff over swings and batted-ball weighted xwOBA on contact', () => {
    const l = pitchLine((arsenal as never as { arsenal: Record<string, never> }).arsenal.SI)
    expect(l.whiff).toBeCloseTo(10, 5)
    expect(l.xwobacon).toBeCloseTo(0.35, 5)
  })
})

describe('buildPitcherSpec', () => {
  it('reproduces the Scout Report pitch table and drops tiny pitches', () => {
    const { spec } = buildPitcherSpec(pitcher(), 'Scout')
    expect(validateSpec(spec).ok).toBe(true)
    expect(spec.template).toBe('contrast')
    expect(spec.columns).toEqual(['Usage', 'Whiff', 'xwOBA'])
    const rows = spec.stats.filter(s => s.group === 'pitch')
    expect(rows.map(r => r.label)).toEqual(['Sinker', 'Changeup', 'Four seam'])
    expect(rows[0]).toMatchObject({ value: '92.6 mph', cells: ['31.7%', '9.3%', '.336'] })
    expect(rows[1].cells).toEqual(['25.8%', '30.7%', '.241'])
    expect(rows[2].cells).toEqual(['12.6%', '', '.307'])   // missing whiff stays blank, never guessed
    expect(spec.title).toBe('Alex Bee, RHP')
  })
  it('reports what is missing rather than inventing it', () => {
    const r = buildPitcherSpec(pitcher({ stats: null, scoutArsenal: [], arsenal: null }), 'Scout')
    expect(r.spec.stats).toEqual([])
    expect(r.missing.join(' ')).toMatch(/arsenal/)
    expect(r.missing.join(' ')).toMatch(/season stats/)
  })
  it('builds both-sided split rows only when both numbers exist', () => {
    const lhb = { ...(arsenal as never as object), arsenal: { SI: { pitch_name: 'Sinker', usage_pct: 100, avg_velo: 90, total_pitches: 100, zones: { '1': zone(60, 6, 0.3, 30) } } } } as never
    const { spec, missing } = buildPitcherSpec(pitcher({ splits: { lhb, rhb: null } }), 'Scout')
    expect(spec.stats.filter(s => s.group === 'contrast').map(s => s.label)).toEqual(['wOBA, 1st vs 3rd time through'])
    expect(missing).toEqual(expect.arrayContaining(['ERA', 'Whiff rate', 'xwOBA on contact']))
  })
})

describe('buildCollisionSpec', () => {
  it('uses both starters and the team block (chase rate, K%, bullpen ERA)', () => {
    const tb = { abbr: 'TB', chase: 29.31, kPct: 0.232, bullpenEra: 2.52 }
    const mil = { abbr: 'MIL', chase: 28.82, kPct: 24.1, bullpenEra: 2.88 }
    const { spec, missing } = buildCollisionSpec(pitcher(), pitcher({ id: 2, name: 'Cy Dee', teamAbbr: 'MIL', oppAbbr: 'TB' }), [tb, mil], 'Scout')
    expect(validateSpec(spec).ok).toBe(true)
    expect(spec.stats.filter(s => s.group === 'hero').map(s => [s.value, s.playerId])).toEqual([['3.10', 1], ['3.10', 2]])
    const t = (l: string) => spec.stats.find(s => s.label === l)?.value
    expect(t('TB chase rate')).toBe('29.3%')
    expect(t('TB strikeout rate')).toBe('23.2%')   // 0.232 fraction normalised to a percent
    expect(t('MIL strikeout rate')).toBe('24.1%')  // already a percent
    expect(t('TB bullpen ERA')).toBe('2.52')
    expect(missing).toEqual([])
  })
  it('lists missing team numbers instead of filling them', () => {
    const { spec, missing } = buildCollisionSpec(pitcher(), pitcher({ id: 2, teamAbbr: 'MIL' }), [null, null], 'Scout')
    expect(spec.stats.filter(s => s.group === 'tile')).toEqual([])
    expect(missing).toContain('TB chase rate')
  })
})

const team = (over: Partial<AttackTeam> = {}): AttackTeam => ({
  abbr: 'MIL', confirmed: true, hitters: [{ id: 10, name: 'Al Bo' }, { id: 11, name: 'Cy Mesa Jr.' }], oppName: 'Alex Bee', oppArsenal: scoutArsenal,
  splits: {
    10: [{ pitch_type: 'SI', pitch_name: 'Sinker', pa: 60, whiff_percent: 22, est_woba: 0.41 }],
    11: [{ pitch_type: 'SI', pitch_name: 'Sinker', pa: 5, whiff_percent: 10, est_woba: 0.3 }, { pitch_type: 'CH', pitch_name: 'Changeup', pa: 40, whiff_percent: 31.6, est_woba: 0.29 }],
  },
  fielders: [
    { position: '1B', playerName: 'A One', totalRuns: 2 }, { position: '2B', playerName: 'B Two', totalRuns: -8 }, { position: '3B', playerName: 'C Three', totalRuns: -12 }, { position: 'SS', playerName: 'D Four', totalRuns: 5 },
    { position: 'LF', playerName: 'E Five', totalRuns: 13 }, { position: 'CF', playerName: 'F Six', totalRuns: null }, { position: 'RF', playerName: 'G Seven', totalRuns: 7 },
  ], ...over,
})
describe('buildAttackSpec', () => {
  it('picks the starter\'s most-used pitch each hitter has enough PA against', () => {
    const { spec } = buildAttackSpec(team(), team({ abbr: 'TB', hitters: [], splits: {} }), 'Scout')
    expect(validateSpec(spec).ok).toBe(true)
    const rows = spec.stats.filter(s => s.group === 'MIL')
    expect(rows).toEqual([
      { group: 'MIL', label: 'Bo', cells: ['Sinker', '.410', '22.0%'] },
      { group: 'MIL', label: 'Mesa', cells: ['Changeup', '.290', '31.6%'] },   // Sinker had only 5 PA, so the next pitch is used
    ])
  })
  it('builds fielding-run tiles with the real minus sign and lists thin positions as missing', () => {
    const { spec, missing } = buildAttackSpec(team(), team({ abbr: 'TB' }), 'Scout')
    const inf = spec.stats.find(s => s.label === 'MIL infield fielding runs')
    expect(inf).toMatchObject({ value: '−13', group: 'oaa' })
    expect(inf?.sub).toBe('Three −12, Two −8, Four +5')
    // outfield: LF + RF present, CF null: two of three is enough; sum 13 + 7
    expect(spec.stats.find(s => s.label === 'MIL outfield fielding runs')?.value).toBe('+20')
    expect(missing).toEqual([])
  })
  it('titles each panel with the starter that team actually faces', () => {
    const { spec } = buildAttackSpec(team({ abbr: 'TB', oppName: 'Jacob Misiorowski' }), team({ abbr: 'MIL', oppName: 'Nick Martinez' }), 'Scout')
    expect(spec.panels).toEqual({ TB: 'TB hitters vs Misiorowski', MIL: 'MIL hitters vs Martinez' })
  })
  it('flags unconfirmed lineups and reports what is missing', () => {
    const { spec, missing } = buildAttackSpec(team({ confirmed: false }), team({ abbr: 'TB', hitters: [] }), 'Scout')
    expect(spec.chips.map(c => c.text)).toContain('UNCONFIRMED')
    expect(spec.subtitle).toMatch(/not confirmed/)
    expect(missing).toContain('TB lineup')
  })
})

describe('buildScoreboardSpec', () => {
  const st = (abbr: string, sb: number, cs: number) => ({ abbr, catcher: { id: 5, name: 'Wil Con', sb: { sb, cs } }, runners: [{ name: 'Fast Guy', sb: { sb: 30, cs: 5 } }, { name: 'Slow Guy', sb: { sb: 1, cs: 1 } }], starter: { name: 'Nick Mar', allowed: { sb: 13, cs: 3 } } })
  it('computes caught stealing from SB and CS and ignores low-attempt runners', () => {
    const { spec } = buildScoreboardSpec(st('MIL', 48, 25), st('TB', 50, 5), [{ teamAbbr: 'MIL', overturns: 14, total: 25 }], 'Scout')
    expect(validateSpec(spec).ok).toBe(true)
    const cat = spec.stats.filter(s => s.group === 'catcher')
    expect(cat[0]).toMatchObject({ label: 'Con', value: '34%', sub: '25 of 73 runners caught', playerId: 5 })
    expect(spec.stats.filter(s => s.group === 'run').some(s => s.label === 'Guy' && s.value === '1 for 2')).toBe(false)
    expect(spec.stats.find(s => s.group === 'abs')).toMatchObject({ value: '14 of 25', sub: '56%' })
  })
})

describe('surname', () => {
  it('drops suffixes', () => {
    expect(surname('Jonny Mesa Jr.')).toBe('Mesa')
    expect(surname('Ken Griffey III')).toBe('Griffey')
    expect(surname('Nick Martinez')).toBe('Martinez')
    expect(surname('Ohtani')).toBe('Ohtani')
  })
})
