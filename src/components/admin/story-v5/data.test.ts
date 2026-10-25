import { describe, expect, it } from 'vitest'
import { buildArsenal, timesThrough } from './arsenal'
import { buildBeats, lastName, storyline, type Pbp } from './beats'
import { bullpenLines, last3Arms, lastGameArms, type Box } from './bullpen'
import { parseCsv } from './csv'
import { buildDefense, startersFromBox, type OaaRow } from './defense'
import { teamInfo } from './teams'
import { PreviewDataError, checkImages, checkRoster } from './validate'
import pbpJson from './__fixtures__/pbp-849805.json'
import boxJson from './__fixtures__/box-849805.json'

// Real data: World Series Game 1, gamePk 849805 (TB 2, MIL 3), trimmed to the fields the code reads.
const pbp = pbpJson as unknown as Pbp
const box = boxJson as unknown as Box
const nameOf = (id: number) => box.teams.away.players[`ID${id}`]?.person.fullName ?? box.teams.home.players[`ID${id}`]?.person.fullName ?? null

describe('csv', () => {
  it('strips the BOM and handles quoted commas', () => {
    const r = parseCsv('﻿a,b\n"Díaz, Yandy",2\n')
    expect(r).toEqual([{ a: 'Díaz, Yandy', b: '2' }])
  })
})

describe('beats from the real Game 1 play by play', () => {
  const { beats } = buildBeats(pbp, nameOf)
  it('picks the 5 scoring plays and 2 caught stealings, in order, 7 at most', () => {
    expect(beats).toHaveLength(7)
    expect(beats.map(b => b.label)).toEqual(['B1', 'B1', 'T4', 'T5', 'T6', 'B7', 'T9'])
  })
  it('writes the sentences from the play data', () => {
    expect(beats[0].text).toBe('Yelich triples, Chourio scores')
    expect(beats[1].text).toBe('Contreras singles, Yelich scores')
    expect(beats[2].text).toBe('Hicks grounds out, Aranda scores')
    expect(beats[3].text).toBe('Contreras throws out Mesa Jr. at third')
    expect(beats[4].text).toBe('Contreras throws out Aranda at second')
    expect(beats[5].text).toBe('Chourio singles, Pratt scores')
  })
  it('tracks the running score and the caught counter', () => {
    expect([beats[0].awayScore, beats[0].homeScore]).toEqual([0, 1])
    expect([beats[6].awayScore, beats[6].homeScore]).toEqual([2, 3])
    expect(beats.map(b => b.caughtTotal)).toEqual([0, 0, 0, 1, 2, 2, 2])
    expect(beats[3].throwToBase).toBe(3); expect(beats[4].throwToBase).toBe(2)
  })
  it('knows who is on base before the play and where movers end', () => {
    const b2 = beats[1]                                           // Contreras singles with Yelich on third
    expect(b2.before.map(x => `${lastName(x.name)}@${x.base}`)).toContain('Yelich@3')
    expect(b2.moves.find(m => lastName(m.name) === 'Yelich')).toMatchObject({ from: 3, to: 4 })
    expect(b2.moves.find(m => lastName(m.name) === 'Contreras')).toMatchObject({ from: 0, to: 1 })
    expect(beats[3].moves.find(m => lastName(m.name) === 'Mesa Jr.')).toMatchObject({ from: 2, to: -1 })
  })
  it('never writes a dash and picks the player in the most beats as the storyline', () => {
    for (const b of beats) expect(b.text).not.toMatch(/[–—-]/)
    const s = storyline(beats)!
    expect(s.last).toBe('Contreras'); expect(s.count).toBe(3); expect(s.of).toBe(7)
  })
  it('caps at max by keeping scoring plays first', () => {
    expect(buildBeats(pbp, nameOf, 5).beats).toHaveLength(5)
  })
})

describe('bullpen from the real box score', () => {
  const tb = lastGameArms(box, 'away'), mil = lastGameArms(box, 'home')
  it('lists relievers by pitches thrown', () => {
    expect(tb.map(a => [a.last, a.pitches])).toEqual([['Matz', 31], ['Kelly', 12], ['Cleavinger', 10], ['Sulser', 4]])
    expect(mil.map(a => [a.last, a.pitches])).toEqual([['Ashby', 20], ['Megill', 20], ['Uribe', 15]])
  })
  it('writes the headline and closing line from the numbers', () => {
    const l = bullpenLines(tb, mil)
    expect(l.headline).toBe('One arm carried the load.')
    expect(l.closing).toBe('Matz: 31 pitches over 1.2 innings. Nobody else threw more than 20.')
  })
  it('days of rest come from the real last appearance date and starters are left out', () => {
    const tbId = box.teams.away.team.id
    const ids = new Set(box.teams.away.pitchers)
    const arms = last3Arms([{ date: '2026-10-23', box }], tbId, '2026-10-24', ids)
    const matz = arms.find(a => a.last === 'Matz')!
    expect(matz).toMatchObject({ p3: 31, lastDate: '2026-10-23', daysRest: 0 })
    expect(arms.some(a => a.id === box.teams.away.pitchers[0])).toBe(false)
    // five days later with no new appearance: rest is 4 days, never 31
    expect(last3Arms([{ date: '2026-10-23', box }], tbId, '2026-10-28', ids).find(a => a.last === 'Matz')).toMatchObject({ p3: 0, daysRest: 4 })
  })
})

describe('defense', () => {
  it('reads the starters (not the substitutes) from a box score', () => {
    const slots = startersFromBox(box.teams.away.players as never)
    expect(slots).toHaveLength(9)
    expect(slots.find(s => s.position === '1B')).toBeTruthy()          // Aranda, replaced later by a pinch runner
    expect(slots.some(s => s.position === 'PR')).toBe(false)
  })
  const slots = ['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map((position, i) => ({ player_id: 100 + i, player_name: `Player Num${i}`, position }))
  const rows: OaaRow[] = [
    ...slots.map((s, i) => ({ id: s.player_id, name: s.player_name, team: 'Brewers', pos: s.position, oaa: i === 3 ? 1 : i })),
    { id: 103, name: 'Player Num3', team: 'Brewers', pos: '3B', oaa: 5 },        // SS slot, but most OAA at 3B
  ]
  it('sums OAA across positions, asterisks an off-position fielder and totals the team', () => {
    const { data, problems } = buildDefense('home', 158, 'Brewers', slots, rows, false)
    expect(problems).toEqual([])
    expect(data!.fielders.find(f => f.pos === 'SS')).toMatchObject({ oaa: 6, mainPos: '3B', offPosition: true })
    expect(data!.footnotes).toEqual(['* OAA MOSTLY AT 3B'])
    expect(data!.teamOaa).toBe(0 + 1 + 2 + 1 + 4 + 5 + 6 + 5)
  })
  it('reports a fielder with no OAA row instead of showing zero', () => {
    const { data, problems } = buildDefense('home', 158, 'Brewers', slots, rows.filter(r => r.id !== 104), false)
    expect(data).toBeNull(); expect(problems.join()).toMatch(/no OAA row for Player Num4/)
  })
})

describe('arsenal', () => {
  const row = (pitch_type: string, description: string, i: number) => ({
    pitch_type, description, release_speed: '95', release_pos_x: '-2', release_pos_y: '53', release_pos_z: '5.3',
    vx0: String(6 + i * 0.01), vy0: '-140', vz0: '-4', ax: '-10', ay: '30', az: '-15',
  })
  it('keeps only types with 20 or more pitches and computes whiff and usage', () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => row('FF', i < 6 ? 'swinging_strike' : i < 20 ? 'foul' : 'ball', i)),
      ...Array.from({ length: 19 }, (_, i) => row('SL', 'ball', i)),
    ]
    const a = buildArsenal(rows)
    expect(a.map(p => p.code)).toEqual(['FF'])
    expect(a[0].whiffPct).toBe(30)                         // 6 whiffs of 20 swings
    expect(a[0].usagePct).toBe(61.2)                       // 30 of 49
    expect(a[0].path.points).toHaveLength(41)
  })
  it('times through the order needs 20 plate appearances in each of the first two trips', () => {
    const pa = (tto: string) => ({ events: 'single', n_thruorder_pitcher: tto, woba_denom: '1', woba_value: '0.9', estimated_woba_using_speedangle: '0.5' })
    const rows = [...Array.from({ length: 20 }, () => pa('1')), ...Array.from({ length: 20 }, () => ({ ...pa('2'), estimated_woba_using_speedangle: '' }))]
    expect(timesThrough(rows)).toEqual({ first: 0.5, second: 0.9, paFirst: 20, paSecond: 20 })
    expect(timesThrough(rows.slice(0, 30))).toBeNull()
  })
})

describe('teams and validation', () => {
  it('has the approved colours for TB and MIL and refuses an unknown team', () => {
    expect(teamInfo(139, 'TB', 'Tampa Bay Rays', 'Rays')).toMatchObject({ primary: '#092C5C', light: '#8FBCE6' })
    expect(teamInfo(158, 'MIL', 'Milwaukee Brewers', 'Brewers')).toMatchObject({ primary: '#12284B', light: '#FFC52F' })
    expect(teamInfo(9999, 'XX', 'Nowhere', 'Nobodies')).toBeNull()
  })
  it('flags a player who is not on the active roster', () => {
    const p: string[] = []
    checkRoster('SD starter', [{ id: 1, name: 'Pivetta' }], new Set([2, 3]), p)
    expect(p).toEqual(['SD starter: Pivetta (1) is not on the active roster'])
  })
  it('flags an image that does not load and reports every problem together', async () => {
    const p: string[] = []
    await checkImages(['https://x/ok.png', 'https://x/bad.png'], p, (async (u: string) => ({ ok: !String(u).includes('bad'), status: String(u).includes('bad') ? 404 : 200 })) as never)
    expect(p).toEqual(['image did not load (HTTP 404): https://x/bad.png'])
    expect(new PreviewDataError(['a', 'b']).message).toMatch(/\(2\)[\s\S]*- a[\s\S]*- b/)
  })
})
