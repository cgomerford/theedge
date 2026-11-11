// src/components/pitch-shape/labelLayout.ts
//
// Where to write each name or label on a chart so no two overlap each other or sit on a marker. Markers are taken in order (the first gets the best spot); for each, positions are tried around it,
// near then farther, and the first free one wins. When none is free the one with the least overlap is used. A label moved well away from its marker is flagged so the chart can draw a thin line
// back to it. All sizes are in the chart's own units. Pure geometry: no data and no React.

export type LabelIn = { id: number; x: number; y: number; text: string }
export type LabelOut = { id: number; x: number; y: number; anchor: 'start' | 'middle' | 'end'; leader: boolean; text: string }
export type LabelOpts = {
  /** text size */
  fs: number
  /** marker radius */
  r: number
  /** the area labels must stay inside */
  x0: number; y0: number; x1: number; y1: number
}

type Box = { x0: number; y0: number; x1: number; y1: number }
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

export function placeLabels(items: LabelIn[], o: LabelOpts): LabelOut[] {
  const { fs, r } = o
  const pad = fs * 0.15
  const width = (t: string) => t.length * fs * 0.56 + pad * 2
  const markers: Box[] = items.map(d => ({ x0: d.x - r - 2, y0: d.y - r - 2, x1: d.x + r + 2, y1: d.y + r + 2 }))
  const placed: Box[] = []
  const out: LabelOut[] = []
  for (const d of items) {
    const w = width(d.text)
    const tries: { dx: number; dy: number; anchor: 'start' | 'middle' | 'end'; far: boolean }[] = []
    for (const k of [1, 2.2, 3.6]) {
      const g = (r + 3) * k
      tries.push(
        { dx: 0, dy: -g, anchor: 'middle', far: k > 1 }, { dx: 0, dy: g + fs * 0.8, anchor: 'middle', far: k > 1 },
        { dx: g, dy: fs * 0.3, anchor: 'start', far: k > 1 }, { dx: -g, dy: fs * 0.3, anchor: 'end', far: k > 1 },
        { dx: g * 0.8, dy: -g * 0.8, anchor: 'start', far: k > 1 }, { dx: -g * 0.8, dy: -g * 0.8, anchor: 'end', far: k > 1 },
        { dx: g * 0.8, dy: g * 0.8 + fs * 0.6, anchor: 'start', far: k > 1 }, { dx: -g * 0.8, dy: g * 0.8 + fs * 0.6, anchor: 'end', far: k > 1 },
      )
    }
    let best: { t: (typeof tries)[number]; box: Box; cost: number } | null = null
    for (const t of tries) {
      const x = d.x + t.dx, y = d.y + t.dy
      const box: Box = { x0: t.anchor === 'middle' ? x - w / 2 : t.anchor === 'start' ? x : x - w, y0: y - fs, x1: t.anchor === 'middle' ? x + w / 2 : t.anchor === 'start' ? x + w : x, y1: y + fs * 0.3 }
      let cost = 0
      for (const b of placed) cost += overlap(box, b)
      markers.forEach((b, i) => { if (items[i] !== d) cost += overlap(box, b) * 2 })
      if (box.x0 < o.x0) cost += (o.x0 - box.x0) * fs * 4
      if (box.x1 > o.x1) cost += (box.x1 - o.x1) * fs * 4
      if (box.y0 < o.y0) cost += (o.y0 - box.y0) * fs * 4
      if (box.y1 > o.y1) cost += (box.y1 - o.y1) * fs * 4
      cost += t.far ? fs * 0.5 : 0   // closer wins a tie
      if (!best || cost < best.cost) best = { t, box, cost }
      if (cost === 0) break
    }
    const pick = best as NonNullable<typeof best>
    placed.push(pick.box)
    out.push({ id: d.id, x: d.x + pick.t.dx, y: d.y + pick.t.dy, anchor: pick.t.anchor, leader: pick.t.far, text: d.text })
  }
  return out
}
