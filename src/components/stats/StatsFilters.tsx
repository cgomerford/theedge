'use client'

// Season, level and game type pickers for the Stats page. Each change reloads the page with ?season=&level=&type= (the tab is kept).
import { useRouter, useSearchParams } from 'next/navigation'

type Opt = { id: string | number; label: string }
export default function StatsFilters({ seasons, levels, types }: { seasons: number[]; levels: Opt[]; types: Opt[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  const get = (k: string, d: string) => sp.get(k) ?? d
  function set(k: string, v: string) {
    const next = new URLSearchParams(sp.toString())
    next.set(k, v)
    router.push(`/mlb/stats?${next.toString()}`)
  }
  const sel: React.CSSProperties = { height: 36, border: '1px solid #e7e2d8', borderRadius: 2, padding: '0 10px', background: '#fff', font: 'inherit', fontWeight: 700 }
  const lab: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#57534E' }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', margin: '14px 0 4px' }}>
      <label style={lab}>Season
        <select style={sel} value={get('season', String(seasons[0]))} onChange={e => set('season', e.target.value)}>{seasons.map(y => <option key={y} value={y}>{y}</option>)}</select>
      </label>
      <label style={lab}>Level
        <select style={sel} value={get('level', '1')} onChange={e => set('level', e.target.value)}>{levels.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      </label>
      <label style={lab}>Games
        <select style={sel} value={get('type', 'R')} onChange={e => set('type', e.target.value)}>{types.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      </label>
    </div>
  )
}
