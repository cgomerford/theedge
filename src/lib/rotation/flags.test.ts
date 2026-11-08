import { describe, it, expect } from 'vitest'
import { readPitcher, readTeam, statusOf, inningsText, daysBetween, type App, type Info } from './flags'

// n starts, 5 days apart from 2026-05-01, fastball 95 mph unless `mod` changes a start.
function apps(n: number, mod: (i: number, a: App) => void = () => {}, team = 'PHI'): App[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 4, 1) + i * 5 * 86400000).toISOString().slice(0, 10)
    const a: App = { gamePk: 1000 + i, date: d, team, opp: 'NYM', isStart: true, pitches: 90, bf: 24, outs: 18, k: 6, bb: 2, csw: 30,
      fb: { FF: { n: 45, v: 95, e: 95.5, l: 94.5, z: 5.9, a: 40 } } }
    mod(i, a)
    return a
  })
}
const info: Info = { name: 'Test Arm', throws: 'R', team: 'PHI', ilCode: null, ilDesc: null }
const AS_OF = '2026-09-27'
const sig = (r: ReturnType<typeof readPitcher>, k: string) => r.signals.find(s => s.key === k)!

describe('readPitcher', () => {
  it('is steady when nothing moves', () => {
    const r = readPitcher(1, info, apps(20), AS_OF)
    expect(r.status).toBe('steady')
    expect(r.signals.every(s => s.level === 'ok' || s.level === 'na')).toBe(true)
    expect(r.starts).toBe(20)
  })

  it('flags fastball speed down 1 mph over the last three starts', () => {
    const r = readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) a.fb.FF.v = 93.8 }), AS_OF)
    expect(sig(r, 'velo').level).toBe('flag')
    expect(sig(r, 'velo').value).toBe('−1.2 mph')
    expect(r.status).toBe('flagged')
  })

  it('watches a half-mph dip and does not flag a pitcher who always throws softer', () => {
    expect(readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) a.fb.FF.v = 94.4 }), AS_OF).status).toBe('watch')
    expect(readPitcher(1, info, apps(20, (_, a) => { a.fb.FF.v = 88 }), AS_OF).status).toBe('steady')
  })

  it('reads a sinker pitcher on the sinker', () => {
    const r = readPitcher(1, info, apps(20, (_, a) => { a.fb = { SI: { n: 50, v: 93, e: 93, l: 93, z: 5.5, a: 35 } } }), AS_OF)
    expect(r.fbType).toBe('SI')
    expect(sig(r, 'velo').level).toBe('ok')
  })

  it('flags speed lost late in outings when it is wider than usual', () => {
    const r = readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) a.fb.FF.l = 92.5 }), AS_OF)   // 3.0 lost now, 1.0 before
    expect(sig(r, 'late').level).toBe('flag')
  })

  it('does not read late-outing speed from short outings', () => {
    const r = readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) { a.pitches = 60; a.fb.FF.l = 92 } }), AS_OF)
    expect(sig(r, 'late').level).toBe('na')
  })

  it('flags heavy pitch counts', () => {
    expect(sig(readPitcher(1, info, apps(20, (i, a) => { if (i === 19) a.pitches = 118 }), AS_OF), 'load').level).toBe('flag')
    expect(sig(readPitcher(1, info, apps(20, (i, a) => { if (i === 19) a.pitches = 111 }), AS_OF), 'load').level).toBe('watch')
    expect(sig(readPitcher(1, info, apps(20), AS_OF), 'load').level).toBe('ok')
  })

  it('counts starts on short rest', () => {
    const short = (i: number, a: App) => { const d = new Date(Date.parse(a.date) - (i >= 18 ? 86400000 * (i - 17) : 0)); a.date = d.toISOString().slice(0, 10) }
    const r = readPitcher(1, info, apps(20, short), AS_OF)
    expect(['watch', 'flag']).toContain(sig(r, 'rest').level)
  })

  it('flags a lower release point', () => {
    expect(sig(readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) a.fb.FF.z = 5.6 }), AS_OF), 'slot').level).toBe('flag')
    expect(sig(readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) a.fb.FF.a = 44 }), AS_OF), 'slot').level).toBe('watch')
  })

  it('a strikes-won dip never changes the status', () => {
    const r = readPitcher(1, info, apps(20, (i, a) => { if (i >= 17) a.csw = 20 }), AS_OF)
    expect(sig(r, 'miss').level).toBe('flag')
    expect(r.status).toBe('steady')
  })

  it('says too few starts rather than guess', () => {
    const r = readPitcher(1, info, apps(5), AS_OF)
    expect(r.status).toBe('thin')
    expect(r.signals).toEqual([])
  })

  it('shows the injured list over everything else', () => {
    const r = readPitcher(1, { ...info, ilCode: 'D15', ilDesc: 'Injured 15-Day' }, apps(20), AS_OF)
    expect(r.status).toBe('out')
    expect(r.ilDesc).toBe('Injured 15-Day')
  })

  it('works out days since his last appearance and innings', () => {
    const r = readPitcher(1, info, apps(20), AS_OF)
    expect(r.daysSince).toBe(daysBetween(r.lastDate as string, AS_OF))
    expect(inningsText(18)).toBe('6.0')
    expect(inningsText(20)).toBe('6.2')
    expect(r.series[0].restDays).toBeNull()
    expect(r.series[1].restDays).toBe(4)
  })
})

describe('statusOf', () => {
  const s = (key: string, level: string) => ({ key, label: key, level, value: '', detail: '' }) as never
  it('two fired signals with one red is flagged; two ambers is watch', () => {
    expect(statusOf([s('velo', 'ok'), s('load', 'flag'), s('slot', 'watch')])).toBe('flagged')
    expect(statusOf([s('velo', 'ok'), s('load', 'watch'), s('slot', 'watch')])).toBe('watch')
    expect(statusOf([s('load', 'flag')])).toBe('watch')
  })
})

describe('readTeam', () => {
  it('takes the five most-used recent starters, then depth, then injured starters', () => {
    const by = new Map<number, App[]>(); const inf = new Map<number, Info>()
    for (let p = 1; p <= 7; p++) {
      by.set(p, apps(p <= 5 ? 20 : 4, (i, a) => { a.gamePk = p * 1000 + i }))
      inf.set(p, { ...info, name: `P${p}` })
    }
    by.set(8, apps(8, (i, a) => { a.gamePk = 8000 + i; a.date = new Date(Date.UTC(2026, 4, 1) + i * 5 * 86400000 - 90 * 86400000).toISOString().slice(0, 10) }))
    inf.set(8, { ...info, name: 'Hurt', ilCode: 'D60', ilDesc: 'Injured 60-Day' })
    const t = readTeam('PHI', by, inf, AS_OF)
    expect(t.rotation).toHaveLength(5)
    expect(t.rotation.map(r => r.id).sort()).toEqual([1, 2, 3, 4, 5].sort())
    expect(t.depth.map(r => r.id).sort()).toEqual([6, 7])
    expect(t.out.map(r => r.id)).toEqual([8])
  })
  it('returns nothing for a club with no games', () => {
    expect(readTeam('XXX', new Map(), new Map(), AS_OF).rotation).toEqual([])
  })
})
