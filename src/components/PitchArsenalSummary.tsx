'use client'

// One-sentence auto-generated summary of a pitcher's arsenal — same pattern
// as PitchingLabContent's "headline read" but built from real Savant data
// instead of the cron pipeline. Template-filled, zero LLM cost, always
// factual — matches the "template-filled single computed fact" approach
// from the story-slide design earlier this session.

import type { ArsenalRow } from '@/app/api/pitcher-arsenal/route'

export default function PitchArsenalSummary({ rows, pitcherName }: { rows: ArsenalRow[]; pitcherName: string }) {
  if (rows.length === 0) return null

  const primary = rows[0] // already sorted by usage desc
  const bestWhiff = [...rows].sort((a, b) => (b.whiffPct ?? 0) - (a.whiffPct ?? 0))[0]
  const bestRV = [...rows].sort((a, b) => (a.runValuePer100 ?? 0) - (b.runValuePer100 ?? 0))[0]

  const parts: string[] = []
  parts.push(`${pitcherName} leads with the ${primary.pitchName} at ${primary.usage.toFixed(0)}% usage.`)

  if (bestWhiff && bestWhiff.whiffPct !== null && bestWhiff.pitchType !== primary.pitchType) {
    parts.push(`The ${bestWhiff.pitchName} generates the most swing-and-miss (${bestWhiff.whiffPct.toFixed(1)}% whiff).`)
  } else if (bestWhiff && bestWhiff.whiffPct !== null) {
    parts.push(`It also leads in whiff rate at ${bestWhiff.whiffPct.toFixed(1)}%.`)
  }

  if (bestRV && bestRV.runValuePer100 !== null && bestRV.runValuePer100 < -0.5) {
    parts.push(`His most valuable pitch by run value is the ${bestRV.pitchName} (${bestRV.runValuePer100.toFixed(1)} RV/100).`)
  }

  return (
    <div className="border-l-[3px] border-orange-500 pl-4 py-1">
      <p className="text-sm font-serif italic text-stone-700 leading-relaxed">{parts.join(' ')}</p>
    </div>
  )
}