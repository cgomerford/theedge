// src/components/player/GradeBanner.tsx
//
// FIXED 2026-08: was designed for a full-width slot; the wireframe moved
// it permanently into the narrow header rail (300px column), where the
// old side-by-side divide-x layout squeezed each dial's text into
// unreadable wrapping. Now always stacks vertically — there's no wide
// context this component renders in anymore.

'use client'

import { useState } from 'react'
import type { PlayerGrade } from '@/lib/player-grade'

function gradeColor(score: number, qualified: boolean): string {
  if (!qualified) return '#a8a29e'
  if (score >= 90) return '#059669'
  if (score >= 75) return '#16a34a'
  if (score >= 45) return '#f59e0b'
  if (score >= 25) return '#f97316'
  return '#dc2626'
}

function GradeDial({
  title, caption, grade, accent,
}: {
  title: string; caption: string; grade: PlayerGrade; accent: string
}) {
  const [open, setOpen] = useState(false)
  const color = gradeColor(grade.score, grade.qualified)

  return (
    <div>
      <button
        onClick={() => grade.components.length > 0 && setOpen(o => !o)}
        className="w-full text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="shrink-0 flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, border: `3px solid ${color}`, background: `${color}0F` }}
          >
            <span className="font-mono font-bold tabular-nums" style={{ fontSize: 20, color }}>
              {grade.qualified ? grade.score : '—'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400">{title}</div>
            <div className="font-serif text-sm font-semibold text-stone-900 leading-tight truncate">
              {grade.qualified ? grade.grade : 'Not enough sample'}
            </div>
          </div>
        </div>
        <div className="text-[9px] font-serif italic text-stone-400 mt-1">{caption}</div>
        {grade.components.length > 0 && (
          <div className="mt-1 font-mono text-[8px] uppercase tracking-widest" style={{ color: accent }}>
            {open ? 'Hide breakdown ▲' : 'Show breakdown ▼'}
          </div>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {grade.components.map(c => (
            <div key={c.key} className="flex items-center gap-2">
              <span className="font-mono text-[8px] uppercase tracking-widest text-stone-400 w-10 shrink-0">{c.label}</span>
              <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.percentile}%`, background: gradeColor(c.percentile, true) }} />
              </div>
              <span className="font-mono text-[8px] font-bold tabular-nums text-stone-600 w-6 text-right">{c.percentile}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GradeBanner({
  seasonGrade, careerGrade, teamColor,
}: {
  seasonGrade: PlayerGrade
  careerGrade: PlayerGrade
  teamColor: string
}) {
  if (!seasonGrade.qualified && !careerGrade.qualified) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 h-full">
      <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-3">⊕ Grade</div>
      <div className="space-y-4 divide-y divide-stone-100">
        <GradeDial title={`${new Date().getFullYear()} Season`} caption="Statcast + league percentile blend" grade={seasonGrade} accent={teamColor} />
        <div className="pt-4">
          <GradeDial title="Career" caption="Cumulative rate stats, scaled" grade={careerGrade} accent={teamColor} />
        </div>
      </div>
    </div>
  )
}