// src/components/postgame/ReportModeToggle.tsx
//
// In-app switch between the two report modes. Both components already
// exist and just take the same `report` prop — this is purely a display
// toggle, no extra data fetching.

'use client'

import { useState } from 'react'
import type { PostgameReport as PostgameReportData } from '@/types/postgame'
import { PostgameReport } from './PostgameReport'
import { PostgameDigest } from './PostgameDigest'

const ORANGE = '#FF5722'
const INK = '#1A1A1A'

export function ReportModeToggle({ report }: { report: PostgameReportData }) {
  const [mode, setMode] = useState<'digest' | 'deep'>('digest')

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <button
          onClick={() => setMode('digest')}
          className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest border"
          style={{
            borderColor: INK,
            background: mode === 'digest' ? INK : 'transparent',
            color: mode === 'digest' ? '#fff' : INK,
          }}
        >
          Digest
        </button>
        <button
          onClick={() => setMode('deep')}
          className="px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest border"
          style={{
            borderColor: INK,
            background: mode === 'deep' ? INK : 'transparent',
            color: mode === 'deep' ? '#fff' : INK,
          }}
        >
          Full Report
        </button>
        {mode === 'digest' && (
          <a
            href={`/mlb/${report.slug}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-mono text-[11px] uppercase tracking-widest"
            style={{ color: ORANGE }}
          >
            Open printable version →
          </a>
        )}
      </div>

      {mode === 'digest' ? <PostgameDigest report={report} /> : <PostgameReport report={report} />}
    </div>
  )
}
