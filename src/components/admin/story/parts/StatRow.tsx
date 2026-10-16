import { SANS } from '@/components/team/ui'
import { ROW, SAFE_W, TYPE } from '../layout'
import { easeOutCubic } from '../motion'

const MID = 230
const SIDE = (SAFE_W - MID) / 2

/** Duel row: away value | label | home value. Better side in orange. `p` = reveal progress 0..1. */
export default function StatRow({ label, away, home, a, h, p, lowerBetter = true, dim = false }: {
  label: string; away: string; home: string; a: number | null; h: number | null; p: number; lowerBetter?: boolean
  /** a side whose number is not trustworthy shows "—" and never highlights */
  dim?: boolean
}) {
  const better = a == null || h == null || a === h ? null : (lowerBetter ? a < h : a > h) ? 'a' : 'h'
  const e = easeOutCubic(p)
  const cell = (txt: string, num: number | null, on: boolean, align: 'left' | 'right') => (
    <div style={{
      width: SIDE, boxSizing: 'border-box', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.statNum, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
      textAlign: align, color: num == null ? '#a89e8c' : on ? '#FF5722' : '#1A1A1A', padding: align === 'left' ? '0 0 0 36px' : '0 36px 0 0',
    }}>{txt}</div>
  )
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: ROW.stat, width: SAFE_W, boxSizing: 'border-box',
      background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28,
      opacity: e, transform: `translateY(${(1 - e) * 24}px)`,
    }}>
      {cell(away, a, better === 'a' && !dim, 'left')}
      <div style={{ width: MID, fontFamily: SANS, fontSize: TYPE.label, color: '#8a8275', textAlign: 'center', letterSpacing: '.04em' }}>{label}</div>
      {cell(home, h, better === 'h' && !dim, 'right')}
    </div>
  )
}
