import { describe, expect, it } from 'vitest'
import { allocate, ballAt, BALL_R_IN, cellBounds, planBalls, ZONE_W_IN, type PlanPitch } from '../arsenalAnim'

const nine = (hot: number[]) => Array.from({ length: 9 }, (_, i) => (hot.includes(i + 1) ? 20 : 0))
const mix: PlanPitch[] = [
  { code: 'FF', color: '#D22D49', usagePct: 50, velo: 96, zones: nine([2, 3]) },
  { code: 'SL', color: '#EEE716', usagePct: 30, velo: 87, zones: nine([7, 8, 9]) },
  { code: 'CH', color: '#1DBE3A', usagePct: 20, velo: 85, zones: nine([8]) },
]

describe('arsenalAnim', () => {
  it('allocate splits by largest remainder and always sums to n', () => {
    expect(allocate([50, 30, 20], 10)).toEqual([5, 3, 2])
    expect(allocate([1, 1, 1], 10).reduce((a, b) => a + b, 0)).toBe(10)
    expect(allocate([0, 0], 5)).toEqual([0, 0])
  })
  it('ball counts follow usage and are deterministic', () => {
    const a = planBalls(mix, 20, 2.4), b = planBalls(mix, 20, 2.4)
    expect(a).toEqual(b)
    const n = (c: string) => a.filter(x => x.code === c).length
    expect(n('FF')).toBeGreaterThan(n('SL')); expect(n('SL')).toBeGreaterThan(n('CH'))
    expect(a.length).toBeLessThanOrEqual(20)
  })
  it('every ball lands inside its own zone cell, inside the rule-book zone', () => {
    for (const ball of planBalls(mix, 20, 2.4)) {
      const c = cellBounds(ball.zone, 20)
      expect(ball.x).toBeGreaterThanOrEqual(c.x0); expect(ball.x).toBeLessThanOrEqual(c.x0 + c.cw)
      expect(ball.y).toBeGreaterThanOrEqual(c.y0); expect(ball.y).toBeLessThanOrEqual(c.y0 + c.ch)
      expect(Math.abs(ball.x)).toBeLessThanOrEqual(ZONE_W_IN / 2)
    }
  })
  it('a pitch lands only where that pitch is actually thrown', () => {
    const slider = planBalls(mix, 20, 2.4).filter(b => b.code === 'SL')
    expect(new Set(slider.map(b => b.zone))).toEqual(new Set([7, 8, 9]))     // only its hot cells receive balls
  })
  it('the last ball has landed by buildEnd, so the hold is a still frame', () => {
    const balls = planBalls(mix, 20, 2.4)
    for (const b of balls) expect(b.launch + b.flight).toBeLessThanOrEqual(2.4 + 1e-9)
    const end = balls.map(b => ballAt(b, 2.4))
    const later = balls.map(b => ballAt(b, 3.5))
    expect(end).toEqual(later)
    expect(end.every(s => s.landed && s.r === BALL_R_IN)).toBe(true)
  })
  it('flight grows the ball toward the plate and hides it before launch', () => {
    const b = planBalls(mix, 20, 2.4)[3]
    expect(ballAt(b, b.launch - 0.01).visible).toBe(false)
    const mid = ballAt(b, b.launch + b.flight / 2)
    expect(mid.visible && !mid.landed).toBe(true)
    expect(mid.r).toBeGreaterThan(0.35); expect(mid.r).toBeLessThan(BALL_R_IN)
  })
  it('pitches without zone data draw no balls (empty state)', () => {
    expect(planBalls([{ code: 'FF', color: '#fff', usagePct: 60, velo: 95, zones: null }], 20, 2)).toEqual([])
  })
})
