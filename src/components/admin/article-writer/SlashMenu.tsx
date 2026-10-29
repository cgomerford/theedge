'use client'

// The block menu: opens at the cursor when a line holds only "/" (or "/word" to filter), or from the toolbar's Insert button.
// Keyboard: arrows move, Enter or Tab inserts, Escape closes. The parent owns the commands; this only draws the list.

export interface SlashItem { id: string; icon: string; label: string; hint: string }

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'image', icon: '▣', label: 'Image', hint: 'Upload or paste a picture' },
  { id: 'chart', label: 'Chart', icon: '◔', hint: 'From the chart picker' },
  { id: 'statRow', label: 'Stat row', icon: '≡', hint: '3 numbers, each with its sample' },
  { id: 'playerCard', label: 'Player card', icon: '☺', hint: 'Headshot, team, one stat line' },
  { id: 'pullQuote', label: 'Pull quote', icon: '❝', hint: 'Large highlighted line' },
  { id: 'dataTable', label: 'Table', icon: '▦', hint: 'Rows split with |' },
  { id: 'gallery', label: 'Image gallery', icon: '▤', hint: '2 to 4 images, one caption' },
  { id: 'xEmbed', label: 'X post', icon: '✕', hint: 'Paste a link' },
  { id: 'h2', label: 'Heading', icon: 'H2', hint: 'Section heading' },
  { id: 'h3', label: 'Subheading', icon: 'H3', hint: 'Smaller heading' },
  { id: 'quote', label: 'Quote', icon: '"', hint: 'Block quote' },
  { id: 'list', label: 'Bulleted list', icon: '•', hint: 'A simple list' },
  { id: 'divider', label: 'Divider', icon: '—', hint: 'Section break' },
]

export function filterItems(q: string): SlashItem[] {
  const s = q.trim().toLowerCase()
  return s ? SLASH_ITEMS.filter(i => i.label.toLowerCase().includes(s) || i.id.toLowerCase().includes(s)) : SLASH_ITEMS
}

export default function SlashMenu({ x, y, items, index, onPick, onHover }: { x: number; y: number; items: SlashItem[]; index: number; onPick: (i: SlashItem) => void; onHover: (n: number) => void }) {
  if (!items.length) return null
  return (
    <div role="listbox" aria-label="Insert a block" style={{ position: 'fixed', left: Math.max(8, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 316)), top: y, zIndex: 50, width: 308, maxHeight: 360, overflow: 'auto', background: '#fff', border: '1px solid #e7e2d8', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: 6 }}>
      {items.map((it, n) => (
        <div key={it.id} role="option" aria-selected={n === index} onMouseEnter={() => onHover(n)} onMouseDown={e => { e.preventDefault(); onPick(it) }}
          style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: n === index ? '#f1eee6' : 'transparent' }}>
          <span style={{ width: 28, height: 28, borderRadius: 6, background: '#f1eee6', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{it.icon}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{it.label}<span style={{ display: 'block', fontWeight: 400, color: '#8a8275', fontSize: 11.5 }}>{it.hint}</span></span>
        </div>
      ))}
    </div>
  )
}
