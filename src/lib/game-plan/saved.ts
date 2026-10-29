// src/lib/game-plan/saved.ts
//
// Things a viewer saves while using the Second Look and Game Plan Card pages, kept in THIS browser only (localStorage): pairs saved from Second Look, and the edits made on
// "Build your own card" (hitter order, hidden hitters, notes, the columns shown). Nothing is sent to the server, so it costs no database space and follows the browser, not the
// account. Every read and write is wrapped, because storage can be unavailable (private windows, blocked site data); the pages work without it.

import type { PairPitch } from '@/lib/second-look/data'

const KEY = 'x9.gameplan.v1'
export type SavedPair = { id: string; savedAt: string; hand: 'R' | 'L'; stand: 'R' | 'L'; ended: string; pitch: string; date: string; pitcher: string; batter: string; first: PairPitch[]; second: PairPitch[]; result: string }
export type CardEdits = { order?: number[]; hidden?: number[]; notes?: Record<string, string>; cols?: Record<string, boolean> }
type Store = { pairs: SavedPair[]; cards: Record<string, CardEdits> }

const empty = (): Store => ({ pairs: [], cards: {} })

export function readStore(): Store {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY)
    if (!raw) return empty()
    const j = JSON.parse(raw) as Partial<Store>
    return { pairs: Array.isArray(j.pairs) ? j.pairs : [], cards: j.cards && typeof j.cards === 'object' ? j.cards : {} }
  } catch { return empty() }
}

function write(s: Store): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); return true } catch { return false }
}

export function savePair(p: SavedPair): boolean {
  const s = readStore()
  s.pairs = [p, ...s.pairs.filter(x => x.id !== p.id)].slice(0, 20)
  return write(s)
}
export function removePair(id: string): void { const s = readStore(); s.pairs = s.pairs.filter(x => x.id !== id); write(s) }
export function saveEdits(cardKey: string, e: CardEdits): boolean { const s = readStore(); s.cards[cardKey] = e; return write(s) }
