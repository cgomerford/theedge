import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny stand-in for the browser: an address, a history stack and popstate listeners. The store under test only touches these.
function fakeWindow(search = '') {
  const listeners: Record<string, (() => void)[]> = {}
  const stack = [search]
  let at = 0
  const w = {
    location: { pathname: '/mlb/lab/pitch-shape', hash: '', get search() { return stack[at] } },
    history: {
      pushState: (_s: unknown, _t: string, url: string) => { stack.splice(at + 1); stack.push(url.includes('?') ? `?${url.split('?')[1]}` : ''); at++ },
      replaceState: (_s: unknown, _t: string, url: string) => { stack[at] = url.includes('?') ? `?${url.split('?')[1]}` : '' },
    },
    addEventListener: (n: string, f: () => void) => { (listeners[n] ??= []).push(f) },
    removeEventListener: (n: string, f: () => void) => { listeners[n] = (listeners[n] ?? []).filter(x => x !== f) },
    back() { at = Math.max(0, at - 1); listeners.popstate?.forEach(f => f()) },
    forward() { at = Math.min(stack.length - 1, at + 1); listeners.popstate?.forEach(f => f()) },
    stack,
  }
  return w
}

async function load(search = '') {
  vi.resetModules()
  const w = fakeWindow(search)
  vi.stubGlobal('window', w)
  const mod = await import('./shapeLevel')
  return { w, mod }
}

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => { vi.unstubAllGlobals() })

describe('the shared level store', () => {
  it('starts as MLB, which is also the server snapshot', async () => {
    const { mod } = await load('')
    expect(mod.getShapeView()).toEqual({ level: 'mlb', season: null })
  })
  it('starts from the address on first use: a reload or a shared link restores the level and season', async () => {
    const { mod } = await load('?level=fsl&season=2026&pitch=FF')
    expect(mod.getShapeView()).toEqual({ level: 'fsl', season: 2026 })
  })
  it('an unknown level in the address is MLB; a season on MLB is ignored', async () => {
    expect((await load('?level=double-a')).mod.getShapeView().level).toBe('mlb')
    expect((await load('?season=2026')).mod.getShapeView()).toEqual({ level: 'mlb', season: null })
  })
  it('switching level tells every subscriber (the map, filters, cards, comparisons, leaderboard and sandbox read this one value)', async () => {
    const { mod } = await load('')
    let a = 0, b = 0
    mod.getShapeView()
    const seen: string[] = []
    // two consumers: the store's public snapshot is the single source of truth, so both see the same value after one change
    const un1 = subscribe(mod, () => { a++; seen.push(`map:${mod.getShapeView().level}`) })
    const un2 = subscribe(mod, () => { b++; seen.push(`sandbox:${mod.getShapeView().level}`) })
    mod.setShapeLevel('aaa')
    expect(a).toBe(1); expect(b).toBe(1)
    expect(seen).toEqual(['map:aaa', 'sandbox:aaa'])
    un1(); un2()
  })
  it('a change writes the address, keeping other parameters, and MLB removes the level', async () => {
    const { mod, w } = await load('?pitch=SL&hand=L')
    mod.setShapeLevel('aaa')
    expect(w.location.search).toBe('?pitch=SL&hand=L&level=aaa')
    mod.setShapeLevel('fsl', 2026)
    expect(w.location.search).toBe('?pitch=SL&hand=L&level=fsl&season=2026')
    mod.setShapeLevel('mlb')
    expect(w.location.search).toBe('?pitch=SL&hand=L')
  })
  it('Back and Forward restore the previous and next level', async () => {
    const { mod, w } = await load('')
    mod.setShapeLevel('aaa'); mod.setShapeLevel('fsl')
    expect(mod.getShapeView().level).toBe('fsl')
    w.back(); expect(mod.getShapeView().level).toBe('aaa')
    w.back(); expect(mod.getShapeView().level).toBe('mlb')
    w.forward(); expect(mod.getShapeView().level).toBe('aaa')
  })
  it('replaceShapeParams changes pitch, hand and sliders without adding a history entry', async () => {
    const { mod, w } = await load('?level=aaa')
    const before = w.stack.length
    mod.replaceShapeParams({ pitch: 'SL', hand: 'L', v: 90, ride: 3, run: 14, arm: 52 })
    expect(w.stack.length).toBe(before)
    expect(w.location.search).toBe('?level=aaa&pitch=SL&hand=L&v=90&ride=3&run=14&arm=52')
  })
  it('re-selecting the current level is a no-op (no history entry, no notification)', async () => {
    const { mod, w } = await load('')
    let n = 0
    subscribe(mod, () => { n++ })
    mod.setShapeLevel('mlb')
    expect(n).toBe(0); expect(w.stack.length).toBe(1)
  })
})

/** Components read the store with useSyncExternalStore(subscribeShapeView, getShapeView); this is the same subscription without React. */
const subscribe = (mod: typeof import('./shapeLevel'), f: () => void) => mod.subscribeShapeView(f)
