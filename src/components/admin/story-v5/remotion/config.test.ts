import { describe, expect, it } from 'vitest'
import { ALL_SCENES, DEFAULT_SCENES, HOLD_FRAMES, MAX_FRAMES, SCENE_LENGTHS, TIMING, layout } from './config'
import { basePos } from './scenes/replay'

describe('v5 timing config', () => {
  it('the approved 7 scenes still add up to 900 frames with the approved starts', () => {
    const l = layout(['hook', 'replay', 'arsenal', 'tunnel', 'defense', 'bullpen', 'outro'])
    expect(l.total).toBe(900)
    expect(l.scenes.map(s => s.from)).toEqual([0, 100, 285, 475, 650, 745, 840])
  })
  it('the default video leaves out the previous game and every optional slide, and fits in the time limit', () => {
    expect(DEFAULT_SCENES).toEqual(['hook', 'arsenal', 'tunnel', 'defense', 'bullpen', 'outro'])
    expect(layout(DEFAULT_SCENES).total).toBe(715)
    expect(MAX_FRAMES).toBe(1350)                                           // 45 s at 30 fps
    expect(layout(DEFAULT_SCENES).total).toBeLessThanOrEqual(MAX_FRAMES)
    expect(layout(ALL_SCENES).total).toBeGreaterThan(MAX_FRAMES)            // every slide at once is still too long
  })
  it('slides lay out in the order given and unknown ids are dropped', () => {
    const l = layout(['outro', 'nope' as never, 'hook'])
    expect(l.scenes.map(s => [s.id, s.from])).toEqual([['outro', 0], ['hook', 60]])
  })
  it('every count-up finishes and holds for at least 1.5 s before its scene cuts', () => {
    const T = TIMING
    const lastLanding = T.arsenal.firstPitch + 3 * T.arsenal.gap + T.arsenal.flight
    const done = {
      hook: T.hook.countFrom + T.hook.countFrames,                       // the number stays until outAt
      arsenal: lastLanding + 30,                                         // whiff count lasts 30 frames
      tunnel: T.tunnel.barsDone,
      defense: T.defense.first + 6 * T.defense.step + T.defense.countFrames,
      bullpen: T.bullpen.first + 6 * T.bullpen.step + T.bullpen.countFrames,
    }
    expect(T.hook.outAt - done.hook).toBeGreaterThanOrEqual(HOLD_FRAMES)
    for (const k of ['arsenal', 'tunnel', 'defense', 'bullpen'] as const) expect(SCENE_LENGTHS[k] - done[k]).toBeGreaterThanOrEqual(HOLD_FRAMES)
  })
  it('base path: home, first, second, third and back home', () => {
    expect(basePos(0)).toEqual({ x: 540, y: 1010 }); expect(basePos(2)).toEqual({ x: 540, y: 510 })
    expect(basePos(4)).toEqual({ x: 540, y: 1010 }); expect(basePos(1.5)).toEqual({ x: 665, y: 635 })
  })
})
