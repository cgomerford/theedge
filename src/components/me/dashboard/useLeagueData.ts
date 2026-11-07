'use client'
// src/components/me/dashboard/useLeagueData.ts
//
// Loads the league rows (every batter, or every pitcher) the widgets compute from, once per role per page load, from /api/me/dashboard/data. The server sends only the stats
// the person's plan allows. A role that has no rows yet reads as 'empty' (the daily job has not filled the table), never as zeros.

import { useEffect, useState } from 'react'
import type { LeagueRow } from '@/lib/dashboard/compute'
import type { Role } from '@/lib/dashboard/stats'
import { log } from '@/lib/log'

export type RoleData = { status: 'loading' | 'ready' | 'empty' | 'error'; rows: LeagueRow[]; season: number | null; updated: string | null }
const LOADING: RoleData = { status: 'loading', rows: [], season: null, updated: null }
const cache = new Map<Role, Promise<RoleData>>()

function load(role: Role): Promise<RoleData> {
  let p = cache.get(role)
  if (!p) {
    p = fetch(`/api/me/dashboard/data?role=${role}`, { cache: 'no-store' })
      .then(async (r): Promise<RoleData> => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = (await r.json()) as { empty?: boolean; season?: number; updated?: string | null; rows?: LeagueRow[] }
        return j.empty || !j.rows ? { status: 'empty', rows: [], season: null, updated: null } : { status: 'ready', rows: j.rows, season: j.season ?? null, updated: j.updated ?? null }
      })
      .catch((e): RoleData => { log.error('useLeagueData', `${role} fetch failed`, e instanceof Error ? e.message : e); cache.delete(role); return { status: 'error', rows: [], season: null, updated: null } })
    cache.set(role, p)
  }
  return p
}

export function useLeagueData(roles: Role[]): Record<Role, RoleData> {
  const [data, setData] = useState<Record<Role, RoleData>>({ batter: LOADING, pitcher: LOADING })
  const need = roles.slice().sort().join(',')
  useEffect(() => {
    let live = true
    for (const role of need.split(',').filter(Boolean) as Role[]) load(role).then(d => { if (live) setData(prev => ({ ...prev, [role]: d })) })
    return () => { live = false }
  }, [need])
  return data
}
