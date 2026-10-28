import { describe, expect, it } from 'vitest'
import { addOutcome } from './data'

const fresh = () => ({ n: 0, take: 0, swing: 0, calledStrike: 0, ball: 0, hbp: 0, whiff: 0, foul: 0, inPlay: 0, pop: 0, weakGb: 0, hardGb: 0, line: 0, weakFb: 0, hardFb: 0, unclassified: 0 })

describe('addOutcome', () => {
  it('splits takes and swings and classes balls in play by shape and exit speed', () => {
    const o = fresh()
    for (const r of [
      { description: 'called_strike', bb_type: null, launch_speed: null, launch_angle: null }, { description: 'ball', bb_type: null, launch_speed: null, launch_angle: null },
      { description: 'swinging_strike', bb_type: null, launch_speed: null, launch_angle: null }, { description: 'foul', bb_type: null, launch_speed: 70, launch_angle: 60 },
      { description: 'hit_into_play', bb_type: 'ground_ball', launch_speed: 101, launch_angle: -3 }, { description: 'hit_into_play', bb_type: 'ground_ball', launch_speed: 80, launch_angle: -3 },
      { description: 'hit_into_play', bb_type: 'popup', launch_speed: 60, launch_angle: 70 }, { description: 'hit_into_play', bb_type: 'fly_ball', launch_speed: 104, launch_angle: 28 },
      { description: 'hit_into_play', bb_type: null, launch_speed: null, launch_angle: null }, { description: 'something_new', bb_type: null, launch_speed: null, launch_angle: null },
    ]) addOutcome(o, r)
    expect(o).toMatchObject({ n: 9, take: 2, swing: 7, calledStrike: 1, ball: 1, whiff: 1, foul: 1, inPlay: 5, hardGb: 1, weakGb: 1, pop: 1, hardFb: 1, unclassified: 1 })
  })
  it('falls back to launch angle when the batted-ball type is blank', () => {
    const o = fresh()
    addOutcome(o, { description: 'hit_into_play', bb_type: null, launch_speed: 100, launch_angle: 15 })
    addOutcome(o, { description: 'hit_into_play', bb_type: null, launch_speed: 70, launch_angle: 55 })
    expect(o).toMatchObject({ line: 1, pop: 1 })
  })
})
