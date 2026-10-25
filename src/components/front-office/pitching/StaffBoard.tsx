'use client'

// §00 Staff board: every pitcher on the club for the chosen window, sortable, each cell shaded by how far it sits
// from the league mean for the pitcher's ROLE (SP / RP). Row click sets ?p= so every tool below re-reads him.
// Hover any header for the definition, any cell for the value, its rank on this staff and its distance from the league
// mean in standard deviations. Props are plain data (no functions). League means/SDs come from fo_league_pitch_context.sd.

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'
import { ordinal } from '@/lib/ordinal'
import { Headshot } from './Avatar'
import { dash, fint, fsigned, fx, ipDisplay, shade, type LeagueStat, type Tone } from './format'
import Tip, { TipBody } from './Tip'

export type StaffLine = {
  id: number; name: string; role: 'SP' | 'RP' | null; throws: 'R' | 'L' | null; age: number | null; ip: number | null; bf: number | null
  kbb: number | null; csw: number | null; whiff: number | null; xera: number | null; era: number | null; fbd: number | null; stuff: number | null
}
export type RoleStats = Record<string, LeagueStat>   // keys: kbb, csw, whiff, xera, era, fbd

type Col = {
  key: string; head: string; def: string; get: (r: StaffLine) => number | string | null; show: (r: StaffLine) => string
  stat?: string; hi?: boolean; left?: boolean; bold?: boolean; dec?: number; unit?: string; rank?: 'hi' | 'lo'
}

const COLS: Col[] = [
  { key: 'name', head: 'Pitcher', def: 'Click a row to load that pitcher into every tool on this page.', get: r => r.name, show: r => r.name, left: true, bold: true },
  { key: 'role', head: 'Role', def: 'Starter if he started at least half his appearances, otherwise reliever. Shading compares him with his own role.', get: r => r.role, show: r => r.role ?? dash, left: true },
  { key: 'age', head: 'Age', def: 'Age today.', get: r => r.age, show: r => fint(r.age) },
  { key: 'ip', head: 'IP', def: 'Innings pitched in the selected window (baseball notation: .1 = one third).', get: r => r.ip, show: r => ipDisplay(r.ip), rank: 'hi' },
  { key: 'kbb', head: 'K−BB%', def: 'Strikeouts minus walks per batter faced. Settles faster than ERA, so it is the first read on process.', get: r => r.kbb, show: r => fx(r.kbb), stat: 'kbb', hi: true, dec: 1, unit: '%', rank: 'hi' },
  { key: 'csw', head: 'CSW%', def: 'Called strikes plus whiffs, per pitch.', get: r => r.csw, show: r => fx(r.csw), stat: 'csw', hi: true, dec: 1, unit: '%', rank: 'hi' },
  { key: 'whiff', head: 'Whiff%', def: 'Swings that miss, per swing.', get: r => r.whiff, show: r => fx(r.whiff), stat: 'whiff', hi: true, dec: 1, unit: '%', rank: 'hi' },
  { key: 'xera', head: 'xERA', def: 'The ERA his contact quality, strikeouts and walks deserved. A season-long figure, so it shows a dash in the shorter windows.', get: r => r.xera, show: r => fx(r.xera, 2), stat: 'xera', hi: false, dec: 2, rank: 'lo' },
  { key: 'era', head: 'ERA', def: 'Earned runs per nine innings in the window.', get: r => r.era, show: r => fx(r.era, 2), stat: 'era', hi: false, dec: 2, rank: 'lo' },
  { key: 'gap', head: 'ERA−xERA', def: 'Positive: his ERA is worse than his process deserved. Negative: better. The gap tends to close over time.', get: r => (r.era != null && r.xera != null ? r.era - r.xera : null), show: r => (r.era != null && r.xera != null ? fsigned(r.era - r.xera, 2) : dash) },
  { key: 'fbd', head: 'FB Δ', def: "Average velocity of his main fastball in the window minus the same pitch's average last season, in mph.", get: r => r.fbd, show: r => fsigned(r.fbd, 1), stat: 'fbd', hi: true, dec: 1, rank: 'hi' },
  { key: 'stuff', head: 'Stuff Grade', def: "x9Lab's own pitch model on the 20-80 scale. It arrives in a later release.", get: () => null, show: r => (r.stuff == null ? dash : String(Math.round(r.stuff))) },
]

export default function StaffBoard({ rows, stats, selected }: { rows: StaffLine[]; stats: Record<string, RoleStats>; selected: number }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'ip', dir: -1 })

  const sorted = useMemo(() => {
    const col = COLS.find(c => c.key === sort.key) ?? COLS[3]
    return [...rows].sort((a, b) => {
      const x = col.get(a), y = col.get(b)
      if (x == null && y == null) return 0
      if (x == null) return 1                      // missing values always sink to the bottom
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir
    })
  }, [rows, sort])

  function pick(id: number) {
    const q = new URLSearchParams(sp.toString())
    q.set('p', String(id)); q.delete('pt')
    router.replace(`${path}?${q.toString()}`, { scroll: false })
  }

  const rankOf = (c: Col, r: StaffLine): [number, number] | null => {
    if (!c.rank) return null
    const mine = c.get(r) as number | null
    if (mine == null) return null
    const have = rows.map(x => c.get(x) as number | null).filter((v): v is number => v != null)
    const better = have.filter(v => (c.rank === 'hi' ? v > mine : v < mine)).length
    return [better + 1, have.length]
  }

  const cellTone = (c: Col, r: StaffLine): Tone => {
    if (!c.stat || !r.role) return null
    return shade(c.get(r) as number | null, stats[r.role]?.[c.stat], c.hi ?? true)
  }

  function cellTip(c: Col, r: StaffLine): React.ReactNode {
    if (c.key === 'name') {
      return <TipBody title={r.name} lines={[['Role', r.role ?? dash], ['Throws', r.throws ?? dash], ['Age', fint(r.age)], ['Innings', ipDisplay(r.ip)], ['Batters faced', fint(r.bf)]]} note="Click to load him into every tool." />
    }
    if (c.key === 'gap') {
      return <TipBody title={`${r.name}: ERA − xERA`} lines={[['ERA', fx(r.era, 2)], ['xERA', fx(r.xera, 2)]]}
        note={r.era != null && r.xera != null ? (r.era > r.xera ? 'ERA is worse than his process deserved.' : 'ERA is better than his process deserved.') : 'xERA is a season-long figure; choose the Season window.'} />
    }
    const lines: [string, string][] = [[c.head, c.show(r)]]
    const rk = rankOf(c, r)
    if (rk) lines.push(['Staff rank', `${ordinal(rk[0])} of ${rk[1]}`])
    const st = c.stat && r.role ? stats[r.role]?.[c.stat] : undefined
    const v = c.get(r) as number | null
    if (st && st.mean != null && st.sd != null && st.sd > 0 && v != null) {
      const z = ((v - st.mean) / st.sd) * (c.hi ? 1 : -1)
      const d = c.dec ?? 1
      lines.push([`League ${r.role} average`, `${st.mean.toFixed(d)}${c.unit ?? ''}`], ['Standard deviation', st.sd.toFixed(d)],
        ['Against the league', `${Math.abs(z).toFixed(1)} SD ${z >= 0 ? 'better' : 'worse'}`])
    }
    return <TipBody title={r.name} lines={lines} note={c.def} />
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            {COLS.map(c => (
              <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                style={{ padding: '6px 8px', textAlign: c.left ? 'left' : 'right', fontWeight: 400, whiteSpace: 'nowrap' }}>
                <Tip content={<TipBody title={c.head} note={`${c.def}${c.key === 'stuff' ? '' : ' Click to sort.'}`} />}>
                  <button onClick={() => c.key !== 'stuff' && setSort(s => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : (c.left ? 1 : -1) }))}
                    style={{ all: 'unset', cursor: c.key === 'stuff' ? 'default' : 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: sort.key === c.key ? C.ink : C.mute }}>
                    {c.head}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </button>
                </Tip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} tabIndex={0} onClick={() => pick(r.id)} onKeyDown={e => { if (e.key === 'Enter') pick(r.id) }}
              className="pd-row" style={{ borderTop: `1px solid ${C.line}`, cursor: 'pointer', background: r.id === selected ? '#FFF3E8' : undefined }}>
              {COLS.map(c => {
                const t = cellTone(c, r)
                return (
                  <td key={c.key} style={{ padding: c.key === 'name' ? '5px 8px' : '7px 8px', textAlign: c.left ? 'left' : 'right', whiteSpace: 'nowrap', background: t?.bg, color: t?.fg ?? (c.key === 'role' || c.key === 'age' ? C.mute : C.ink), fontWeight: c.bold || t ? 700 : 400 }}>
                    <Tip block content={cellTip(c, r)}>
                      {c.key === 'name'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Headshot id={r.id} size={26} ring={r.id === selected ? C.orange : undefined} />{c.show(r)}</span>
                        : c.show(r)}
                    </Tip>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
