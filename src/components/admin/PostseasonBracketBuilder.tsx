'use client'

// src/components/admin/PostseasonBracketBuilder.tsx
//
// Admin builder for the full postseason bracket X graphic (Wild Card through
// World Series, all in one 1600x900 diagram). Fully manual — no live
// standings/results fetch, no Supabase table. George fills in all 11 slots
// by hand (team + seed + an optional status line) and re-exports the whole
// bracket as rounds progress. Same scaled-preview + export pattern as
// ScoutGraphicBuilder/GamePreviewBuilder.

import { useMemo, useRef, useState } from 'react'
import { MLB_TEAMS } from '@/lib/teams'
import PostseasonBracketCard, { EMPTY_TEAM, type BracketMatchup, type BracketTeam, type SlotKey } from './PostseasonBracketCard'

const SLOT_GROUPS: { round: string; slots: { key: SlotKey; label: string }[] }[] = [
  {
    round: 'Wild Card',
    slots: [
      { key: 'al_wc_top', label: 'AL 3 vs 6' },
      { key: 'al_wc_bot', label: 'AL 4 vs 5' },
      { key: 'nl_wc_top', label: 'NL 3 vs 6' },
      { key: 'nl_wc_bot', label: 'NL 4 vs 5' },
    ],
  },
  {
    round: 'Division Series',
    slots: [
      { key: 'al_ds_top', label: 'ALDS' },
      { key: 'al_ds_bot', label: 'ALDS' },
      { key: 'nl_ds_top', label: 'NLDS' },
      { key: 'nl_ds_bot', label: 'NLDS' },
    ],
  },
  {
    round: 'Championship',
    slots: [
      { key: 'al_cs', label: 'ALCS' },
      { key: 'nl_cs', label: 'NLCS' },
    ],
  },
  {
    round: 'World Series',
    slots: [
      { key: 'ws', label: 'World Series' },
    ],
  },
]

const ALL_SLOT_KEYS: SlotKey[] = SLOT_GROUPS.flatMap(g => g.slots.map(s => s.key))
const LABEL_BY_KEY: Record<SlotKey, string> = Object.fromEntries(
  SLOT_GROUPS.flatMap(g => g.slots.map(s => [s.key, s.label]))
) as Record<SlotKey, string>

const emptyMatchup = (key: SlotKey): BracketMatchup => ({ label: LABEL_BY_KEY[key], teamA: { ...EMPTY_TEAM }, teamB: { ...EMPTY_TEAM }, status: '' })

const selectCls = 'font-mono text-[11px] border border-stone-300 rounded px-1.5 py-1 bg-white w-full'
const numCls = 'font-mono text-[11px] border border-stone-300 rounded px-1 py-1 bg-white w-12 text-center'
const labelCls = 'block font-mono text-[8.5px] uppercase tracking-widest text-stone-400 mb-0.5'

function teamToBracketTeam(teamId: number | null, seed: number | null): BracketTeam {
  if (teamId == null) return { ...EMPTY_TEAM, seed }
  const t = MLB_TEAMS.find(t => t.id === teamId)
  if (!t) return { ...EMPTY_TEAM, seed }
  return { teamId: t.id, name: t.name, abbrev: t.abbrev, color: t.primary_color, seed }
}

export default function PostseasonBracketBuilder() {
  const [slots, setSlots] = useState<Record<SlotKey, BracketMatchup>>(() => {
    const init = {} as Record<SlotKey, BracketMatchup>
    for (const key of ALL_SLOT_KEYS) init[key] = emptyMatchup(key)
    return init
  })
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const year = new Date().getFullYear()

  const updateStatus = (key: SlotKey, status: string) => {
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], status } }))
  }

  const updateTeam = (key: SlotKey, side: 'teamA' | 'teamB', field: 'teamId' | 'seed', value: number | null) => {
    setSlots(prev => {
      const current = prev[key][side]
      const teamId = field === 'teamId' ? value : current.teamId
      const seed = field === 'seed' ? value : current.seed
      return { ...prev, [key]: { ...prev[key], [side]: teamToBracketTeam(teamId, seed) } }
    })
  }

  const sortedTeams = useMemo(() => [...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name)), [])

  const handleExport = async () => {
    if (!cardRef.current || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, backgroundColor: '#FAF8F3', pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `postseason-bracket-${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[PostseasonBracketBuilder] export failed:', err)
      setExportError('Export failed — check the console.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="px-3 py-1.5 text-xs font-mono rounded bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating…' : 'Export PNG (3200×1800)'}
        </button>
      </div>

      {exportError && <p className="text-[11px] font-mono text-red-600 mb-2">{exportError}</p>}

      <div className="mb-5" style={{ width: 800, height: 450, overflow: 'hidden', border: '1px solid #e7e2d8', borderRadius: 8 }}>
        <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1600, height: 900 }}>
          <PostseasonBracketCard ref={cardRef} year={year} slots={slots} />
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {SLOT_GROUPS.map(group => (
          <div key={group.round}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-stone-500 mb-2 pb-1 border-b border-stone-200">{group.round}</div>
            <div className="flex flex-col gap-2">
              {group.slots.map(({ key, label }) => {
                const m = slots[key]
                return (
                  <div key={key} className="border border-stone-200 rounded-lg p-2 bg-white">
                    <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-1.5">{label}</div>
                    <div className="flex gap-1.5 mb-1">
                      <select
                        value={m.teamA.teamId ?? ''}
                        onChange={e => updateTeam(key, 'teamA', 'teamId', e.target.value ? Number(e.target.value) : null)}
                        className={selectCls}
                      >
                        <option value="">— team A —</option>
                        {sortedTeams.map(t => <option key={t.id} value={t.id}>{t.abbrev} · {t.name}</option>)}
                      </select>
                      <input
                        type="number" min={1} max={6}
                        value={m.teamA.seed ?? ''}
                        onChange={e => updateTeam(key, 'teamA', 'seed', e.target.value ? Number(e.target.value) : null)}
                        className={numCls}
                        placeholder="#"
                      />
                    </div>
                    <div className="flex gap-1.5 mb-1.5">
                      <select
                        value={m.teamB.teamId ?? ''}
                        onChange={e => updateTeam(key, 'teamB', 'teamId', e.target.value ? Number(e.target.value) : null)}
                        className={selectCls}
                      >
                        <option value="">— team B —</option>
                        {sortedTeams.map(t => <option key={t.id} value={t.id}>{t.abbrev} · {t.name}</option>)}
                      </select>
                      <input
                        type="number" min={1} max={6}
                        value={m.teamB.seed ?? ''}
                        onChange={e => updateTeam(key, 'teamB', 'seed', e.target.value ? Number(e.target.value) : null)}
                        className={numCls}
                        placeholder="#"
                      />
                    </div>
                    <input
                      type="text"
                      value={m.status}
                      onChange={e => updateStatus(key, e.target.value)}
                      className="w-full font-mono text-[10px] border border-stone-300 rounded px-1.5 py-1 bg-white"
                      placeholder="status, e.g. leads 1-0"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <p className={`${labelCls} mt-3`}>Fully manual — pick teams/seeds as results come in and re-export.</p>
    </div>
  )
}
