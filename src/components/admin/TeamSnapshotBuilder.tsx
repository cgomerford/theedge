'use client'

// src/components/admin/TeamSnapshotBuilder.tsx
//
// Admin builder for the Team Snapshot X graphic: pick a club, preview the
// 1080x1350 card scaled down, export the full-size PNG. Same scaled-preview +
// html-to-image export pattern as PostseasonBracketBuilder.

import { useRef, useState } from 'react'
import TeamSnapshotCard from './TeamSnapshotCard'
import type { TeamSnapshotData, SnapshotMode } from '@/lib/admin-team-card'

export default function TeamSnapshotBuilder({ regular, postseason }: { regular: TeamSnapshotData[]; postseason: TeamSnapshotData[] }) {
  const [mode, setMode] = useState<SnapshotMode>('regular')
  const teams = mode === 'postseason' ? postseason : regular
  const [teamId, setTeamId] = useState<number | null>(regular[0]?.teamId ?? null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // A club picked in one mode may not exist in the other (only 12 reach October): fall back to the first listed.
  const team = teams.find(t => t.teamId === teamId) ?? teams[0] ?? null

  if (regular.length === 0 && postseason.length === 0) {
    return <p className="font-mono text-[11px] text-stone-500">League table unavailable — try again shortly (see server log for [getTeamSnapshots]).</p>
  }

  const handleExport = async () => {
    if (!cardRef.current || !team || isExporting) return
    setIsExporting(true)
    setExportError(null)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, backgroundColor: '#FAF8F3', pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `team-snapshot-${mode}-${team.abbrev.toLowerCase()}-${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('[TeamSnapshotBuilder] export failed:', err)
      setExportError('Export failed — check the console.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded overflow-hidden border border-stone-300">
          {(['regular', 'postseason'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 text-[11px] font-mono ${mode === m ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'}`}
            >
              {m === 'regular' ? 'Regular season' : 'Postseason'}
            </button>
          ))}
        </div>
        <select
          value={team?.teamId ?? ''}
          onChange={e => setTeamId(e.target.value ? Number(e.target.value) : null)}
          className="font-mono text-[11px] border border-stone-300 rounded px-1.5 py-1 bg-white"
        >
          {teams.map(t => <option key={t.teamId} value={t.teamId}>{t.abbrev} · {t.name}</option>)}
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || !team}
          className="px-3 py-1.5 text-xs font-mono rounded bg-stone-900 text-white hover:bg-stone-700 transition disabled:opacity-50"
        >
          {isExporting ? 'Generating…' : 'Export PNG (2160×2700)'}
        </button>
      </div>

      {exportError && <p className="text-[11px] font-mono text-red-600 mb-2">{exportError}</p>}

      {mode === 'postseason' && postseason.length === 0 && (
        <p className="font-mono text-[11px] text-stone-500 mb-2">No postseason games found yet — nothing to show.</p>
      )}

      {team && (
        <div style={{ width: 540, height: 675, overflow: 'hidden', border: '1px solid #e7e2d8', borderRadius: 8 }}>
          <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1080, height: 1350 }}>
            <TeamSnapshotCard ref={cardRef} team={team} />
          </div>
        </div>
      )}
    </div>
  )
}
