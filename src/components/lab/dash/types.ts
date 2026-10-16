// src/components/lab/dash/types.ts
//
// Dashboard model for the Lab's Power BI-style builder: a list of visuals
// (tiles), each bound to club-level metrics from the catalog in
// src/lib/lab/team-summary.ts. Pure data — safe to persist as JSON.

import type { Role } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'

export type Channel = { metric: string; role: Role }
export type Kind = 'kpi' | 'scatter' | 'bars' | 'table' | 'hist' | 'radar' | 'mix' | 'dumbbell' | 'movement' | 'heat' | 'flight' | 'armclock'
export type Heat = 'use' | 'whiff' | 'velo'
export type Tile = {
  id: string
  kind: Kind
  title: string          // empty = auto title
  span: 1 | 2 | 4        // columns on the 4-column canvas
  x: Channel             // scatter X · bars/kpi metric
  y: Channel             // scatter Y
  size: Channel | null
  color: Channel | null
  trend: boolean
  labels: boolean
  desc: boolean          // bars: highest first
  cols: Channel[]        // table columns · radar axes
  heat?: Heat            // heatmap: what each cell shows
  split?: boolean        // donut: one per selected club (default on)
}

export const ch = (metric: string, role: Role = 'all'): Channel => ({ metric, role })

let n = 0
export const newId = () => `t${Date.now().toString(36)}${(n++).toString(36)}`

export function blankTile(kind: Kind): Tile {
  return {
    id: newId(), kind, title: '', span: kind === 'kpi' ? 1 : kind === 'table' || kind === 'heat' ? 4 : 2,
    x: ch(kind === 'scatter' ? 'relVar' : kind === 'dumbbell' ? 'ra9' : 'whiff'), y: ch(kind === 'scatter' ? 'whiff' : 'ra9'),
    size: null, color: null, trend: true, labels: true, desc: true,
    cols: kind === 'radar' ? [ch('whiff'), ch('xwoba'), ch('kpct'), ch('bbpct'), ch('relVar'), ch('aaSd')] : [ch('ra9'), ch('xwoba'), ch('whiff'), ch('kpct'), ch('relVar'), ch('aaSd')],
    heat: 'use',
  }
}

export function defaultTiles(): Tile[] {
  const t = (kind: Kind, patch: Partial<Tile>): Tile => ({ ...blankTile(kind), ...patch })
  return [
    t('kpi', { x: ch('ra9') }),
    t('kpi', { x: ch('xwoba') }),
    t('kpi', { x: ch('whiff') }),
    t('kpi', { x: ch('relVar') }),
    t('scatter', { x: ch('relVar'), y: ch('whiff') }),
    t('scatter', { x: ch('aaSd'), y: ch('xwoba') }),
    t('bars', { x: ch('aaSd') }),
    t('bars', { x: ch('relVar', 'sp'), desc: false }),
    t('hist', { x: ch('relVar') }),
    t('dumbbell', { x: ch('ra9') }),
    t('radar', {}),
    t('mix', {}),
    t('armclock', { span: 4 }),
    t('flight', { span: 2 }),
    t('movement', {}),
    t('heat', { heat: 'use' }),
    t('table', {}),
  ]
}

export const STORAGE_KEY = 'lab-dashboard-v2'
