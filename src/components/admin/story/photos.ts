// src/components/admin/story/photos.ts
import type { StoryGame } from './types'

/** Every player id any segment of this story can show a headshot for. */
export function storyPlayerIds(g: StoryGame): number[] {
  const ids: number[] = []
  const add = (id: number | null | undefined) => { if (id) ids.push(id) }
  add(g.sp.away.id); add(g.sp.home.id)
  g.bullpen?.away?.arms.forEach(a => add(a.id)); g.bullpen?.home?.arms.forEach(a => add(a.id))
  for (const d of [g.defense.away, g.defense.home]) d?.fielders.forEach(f => add(f.playerId))
  g.streaks.forEach(s => add(s.playerId))
  g.form.forEach(f => add(f.playerId))
  return [...new Set(ids)]
}
