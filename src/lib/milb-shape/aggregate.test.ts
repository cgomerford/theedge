import { describe, it, expect } from 'vitest'
import { Aggregator, MIN_PITCHES, N_POINTS, NO_SLOT, cleanName, hash32 } from './aggregate'
import { row } from './test-fixtures'

const feed = (rows: ReturnType<typeof row>[], level: 'aaa' | 'fsl' = 'aaa') => { const a = new Aggregator(level, 2026); rows.forEach(r => a.add(r)); return a }

describe('bins and cells use the MLB builders\' definitions', () => {
  it('places a pitch and counts its outcome the way build_pitch_shape_bins.py does', () => {
    // 94.4 mph, pfx_x -0.7 ft (RHP) -> hb 8.4 in, pfx_z 1.3 ft -> ivb 15.6 in, arm angle 38.5
    const a = feed([
      row({ game: 1001, ab: 1, pn: 1, description: 'swinging_strike' }),
      row({ game: 1001, ab: 1, pn: 2, description: 'called_strike' }),
      row({ game: 1001, ab: 1, pn: 3, description: 'foul' }),
      row({ game: 1001, ab: 1, pn: 4, description: 'ball' }),
      row({ game: 1001, ab: 2, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: 0.5, launch_speed: 101, bb_type: 'ground_ball' }),
      row({ game: 1001, ab: 3, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: 0.25, launch_speed: 80, bb_type: 'fly_ball' }),
      row({ game: 1001, ab: 4, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: '', launch_speed: '', bb_type: 'popup' }),   // no contact data: a swing, not a measured ball in play
    ])
    const bins = a.binRows()
    expect(bins).toHaveLength(1)
    expect(bins[0]).toMatchObject({ level: 'aaa', span: '2026', pitch_type: 'FF', p_throws: 'R', velo_bin: 94, ivb_bin: 8, hb_bin: 4, slot_bin: 3,
      n_pitches: 7, n_swings: 5, n_whiffs: 1, n_called_strikes: 1, n_csw: 2, n_bbe: 2, n_hard_hit: 1, n_gb: 1 })
    expect(bins[0].xwoba_con_sum).toBeCloseTo(0.75, 6)
  })
  it('cells: tenths of an inch, round half up, with swings and whiffs', () => {
    const a = feed([row({ game: 1001, ab: 1, pn: 1, description: 'swinging_strike' }), row({ game: 1001, ab: 1, pn: 2, description: 'ball' })])
    const c = a.cellRows()[0]
    expect(c).toMatchObject({ level: 'aaa', span: '2026', pitch_type: 'FF', p_throws: 'R', n_pitches: 2, n_swings: 1, n_whiffs: 1 })
    expect(c.cells).toEqual([84, 156, 2, 1, 1])   // 8.4 in -> 84, 15.6 in -> 156
  })
  it('a left-hander is flipped so arm side is positive', () => {
    const a = feed([row({ game: 1001, ab: 1, pn: 1, p_throws: 'L', pfx_x: 0.7 })])
    expect(a.cellRows()[0].cells.slice(0, 2)).toEqual([84, 156])
    expect(a.cellRows()[0].p_throws).toBe('L')
  })
  it('only standard pitch types reach the tables; others are still counted as rows', () => {
    const a = feed([row({ game: 1001, ab: 1, pn: 1, pitch_type: 'FO' }), row({ game: 1001, ab: 1, pn: 2, pitch_type: 'KN' }), row({ game: 1001, ab: 1, pn: 3 })])
    expect(a.summary.rows).toBe(3); expect(a.summary.usable).toBe(1)
    expect(a.binRows().map(b => b.pitch_type)).toEqual(['FF'])
  })
  it('untracked pitches (no speed or movement) are in the coverage counts but not in any table', () => {
    const a = feed([row({ game: 1001, ab: 1, pn: 1, release_speed: '', pfx_x: '', pfx_z: '', pitch_type: '' }), row({ game: 1001, ab: 1, pn: 2 })])
    expect(a.summary.rows).toBe(2); expect(a.summary.usable).toBe(1)
    expect(a.summary.nulls.release_speed).toBe(1)
    expect(a.coverageRows()).toEqual([{ level: 'aaa', season: 2026, month: 8, park: 'DUR', games: 1, pitches: 2, tracked: 1 }])
  })
})

describe('arm angle is never invented', () => {
  it('a pitch with no arm angle goes to slot bin -1, is in the cells, and is not in any pitcher row', () => {
    const a = feed(Array.from({ length: 60 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1, arm_angle: '' })))
    expect(a.binRows().every(b => b.slot_bin === NO_SLOT)).toBe(true)
    expect(a.cellRows()[0].n_pitches).toBe(60)
    expect(a.pitcherRows()).toEqual([])
    expect(a.summary.withSlot).toBe(0)
  })
})

describe('duplicates (Savant lists some balls in play twice)', () => {
  it('drops an exact repeat once and counts it', () => {
    const r = row({ game: 1001, ab: 1, pn: 1, description: 'hit_into_play', estimated_woba_using_speedangle: 0.4, launch_speed: 90, bb_type: 'line_drive' })
    const a = feed([r, { ...r }, r])
    expect(a.summary.rows).toBe(1); expect(a.summary.duplicates).toBe(2)
    expect(a.binRows()[0].n_pitches).toBe(1); expect(a.binRows()[0].n_bbe).toBe(1)
  })
  it('the same identity with different content is a conflict: the first is kept and the conflict is counted', () => {
    const a = feed([row({ game: 1001, ab: 1, pn: 1, release_speed: 94.4 }), row({ game: 1001, ab: 1, pn: 1, release_speed: 90 })])
    expect(a.summary.keyConflicts).toBe(1); expect(a.summary.duplicates).toBe(0); expect(a.summary.rows).toBe(1)
  })
})

describe('pitcher rows', () => {
  const pitches = (n: number) => Array.from({ length: n }, (_, i) => row({
    game: 1001 + (i % 3), ab: i + 1, pn: 1, pfx_x: -0.5 - (i % 7) * 0.05, pfx_z: 1.2 + (i % 5) * 0.04, release_speed: 93 + (i % 4) * 0.5, arm_angle: 30 + (i % 6),
    description: ['swinging_strike', 'foul', 'ball', 'called_strike', 'hit_into_play'][i % 5], inning_topbot: i % 2 ? 'Top' : 'Bot', player_name: 'Early, Connelly',
  }))
  it('averages, spreads and counts the way build_pitch_shape_pitcher.py does (population standard deviation)', () => {
    const rows = pitches(55)
    const p = feed(rows).pitcherRows()[0]
    const hb = rows.map(r => 12 * -(r.pfx_x as number)), ivb = rows.map(r => 12 * (r.pfx_z as number))
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
    const sd = (x: number[]) => Math.sqrt(mean(x.map(v => (v - mean(x)) ** 2)))
    expect(p.n_pitches).toBe(55)
    expect(p.hb).toBeCloseTo(mean(hb), 2); expect(p.ivb).toBeCloseTo(mean(ivb), 2)
    expect(p.sd_hb).toBeCloseTo(sd(hb), 2); expect(p.sd_ivb).toBeCloseTo(sd(ivb), 2)
    expect(p.velo).toBeCloseTo(mean(rows.map(r => r.release_speed as number)), 2)
    expect(p.pitcher_name).toBe('Connelly Early')
    expect(p.n_swings).toBe(rows.filter(r => ['swinging_strike', 'foul', 'hit_into_play'].includes(r.description as string)).length)
    expect(p.level).toBe('aaa'); expect(p.season).toBe(2026)
  })
  it('keeps nobody under the minimum and at most 60 sample pitches', () => {
    expect(feed(pitches(MIN_PITCHES - 1)).pitcherRows()).toEqual([])
    expect(feed(pitches(200)).pitcherRows()[0].points).toHaveLength(N_POINTS)
  })
  it('his club is the one he was pitching for: top of the inning means the home club', () => {
    const only = feed(Array.from({ length: 50 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1, inning_topbot: 'Top' }))).pitcherRows()[0]
    expect(only.team_abbr).toBe('DUR')
    const away = feed(Array.from({ length: 50 }, (_, i) => row({ game: 1001, ab: i + 1, pn: 1, inning_topbot: 'Bot' }))).pitcherRows()[0]
    expect(away.team_abbr).toBe('GWN')
  })
  it('the same pitcher at two levels is two rows, never merged', () => {
    const a = feed(pitches(60), 'aaa').pitcherRows()[0], b = feed(pitches(60), 'fsl').pitcherRows()[0]
    expect(a.pitcher_id).toBe(b.pitcher_id)
    expect(a.level).not.toBe(b.level)
  })
})

describe('a rerun is the same, whatever order the rows arrive in', () => {
  it('shuffled and repeated input gives identical tables', () => {
    const rows = Array.from({ length: 150 }, (_, i) => row({ game: 1001 + (i % 3), ab: (i % 40) + 1, pn: Math.floor(i / 40) + 1, pitcher: 100 + (i % 2), pfx_x: -0.4 - (i % 9) * 0.03, description: ['ball', 'swinging_strike', 'foul'][i % 3] }))
    const one = feed(rows)
    const two = feed([...rows].reverse().concat(rows.slice(0, 40)))
    expect(two.binRows().sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))).toEqual(one.binRows().sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))))
    expect(two.cellRows()).toEqual(one.cellRows())
    expect(two.pitcherRows()).toEqual(one.pitcherRows())
    expect(two.summary.rows).toBe(one.summary.rows)
  })
  it('hash32 is stable', () => { expect(hash32('100:1001:1:1')).toBe(hash32('100:1001:1:1')); expect(hash32('a')).not.toBe(hash32('b')) })
  it('cleans names', () => { expect(cleanName('Early, Connelly')).toBe('Connelly Early'); expect(cleanName('Ohtani')).toBe('Ohtani') })
})
