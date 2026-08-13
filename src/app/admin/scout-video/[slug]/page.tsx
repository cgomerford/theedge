// src/app/admin/scout-video/[slug]/page.tsx
//
// Admin page for the Scout Report MP4 export. Pulls a fresh ScoutInputs
// via getScoutInputsForSlug() (src/lib/scout-inputs.ts), builds the report,
// renders ScoutReelPanel.

import { notFound } from 'next/navigation'
import { buildScoutReport, type ScoutReport } from '@/lib/scout'
import { getScoutInputsForSlug } from '@/lib/scout-inputs'
import ScoutReelPanel from '@/components/admin/ScoutReelPanel'
import type { ScoutVideoContext } from '@/lib/scout-video'

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

export default async function ScoutVideoPage({ params }: Props) {
  const { slug } = await params

  const result = await getScoutInputsForSlug(slug)
  if (!result) notFound()
  const { game, inputs, awayAbbr, homeAbbr } = result

  const report: ScoutReport = buildScoutReport(inputs)

  const videoContext: ScoutVideoContext = {
    gameSlug: slug,
    awayAbbr,
    homeAbbr,
    awayTeamId: game.teams.away.team.id,
    homeTeamId: game.teams.home.team.id,
  }

  return (
    <main style={{ background: '#FAF8F3', minHeight: '100vh', padding: '24px 16px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            borderBottom: '1px solid #1A1A1A1a', paddingBottom: 8, marginBottom: 8,
          }}
        >
          <span style={{ color: '#FF5722', fontSize: 18 }}>§</span>
          <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontWeight: 600, fontSize: 20, letterSpacing: '-0.3px' }}>
            Scout Report video — {awayAbbr} @ {homeAbbr}
          </h2>
          <span
            style={{
              marginLeft: 'auto', fontSize: 10, textTransform: 'uppercase',
              letterSpacing: '1.5px', color: '#6b6b66', fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {report.actualCount} rows · vertical 9:16 · MP4
          </span>
        </div>
        {report.degradedNote && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#A3A3A3', marginBottom: 16 }}>
            Report ran short on some sections: {report.degradedNote}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <ScoutReelPanel report={report} context={videoContext} />
        </div>
      </div>
    </main>
  )
}