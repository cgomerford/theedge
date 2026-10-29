// src/lib/game-plan/zones.ts
//
// Plain words for Statcast's zones, from the catcher's view. The batter's side decides which column is "in": a right-handed batter stands on the left of the plate in that
// view. Zones 1-9 are the strike zone (3 by 3, up to down, left to right); 11-14 are the chase corners outside it. The same rule is in scripts/build_game_plan_cards.py
// (zone_label), which writes the words stored on the cards, so the two must stay in step.

export function zoneLabel(z: number | null | undefined, stand: 'L' | 'R' | null): string | null {
  if (z == null || !Number.isFinite(z) || !stand) return null
  const insideLeft = stand === 'R'
  if (z >= 1 && z <= 9) {
    const row = Math.floor((z - 1) / 3), col = (z - 1) % 3
    const side = col === 0 ? (insideLeft ? 'in' : 'away') : col === 2 ? (insideLeft ? 'away' : 'in') : null
    if (side == null) return ['up', 'middle', 'low'][row]
    return row === 0 ? `up-${side}` : row === 2 ? `low-${side}` : side
  }
  if (z === 11 || z === 12 || z === 13 || z === 14) {
    const inside = z === 11 || z === 13 ? insideLeft : !insideLeft
    if (z <= 12) return inside ? 'up and in' : 'up and away'
    return inside ? 'back foot' : 'down-away'
  }
  return null
}
