// src/app/mlb/lab/pitching-lab/[playerId]/(pro)/stuff/page.tsx
//
// The Pitching Lab's Stuff tab: the same x9Stuff grades as the x9Stuff Lab (/mlb/lab/stuff), for this one pitcher. Stuff, Command and Overall on the 100 scale,
// his arsenal, movement against the league and how each pitch has ended. Reads stored rows only (stuff_lab_* tables, pitch_shape_*, pitch_events). The older Edge+
// panel is no longer shown here. Sits inside the Pro tabs group, so the layout's gate has already run.

import StuffLab from '@/components/stuff-lab/StuffLab'
import { Empty } from '@/components/team/ui'
import { getStuffBoard, getStuffDetail } from '@/lib/stuff-lab/data'

export const dynamic = 'force-dynamic'

export default async function StuffPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const id = Number(playerId)
  const season = new Date().getFullYear()
  const board = await getStuffBoard(season)
  if (!board) return <Empty>The pitch grades are not loaded yet.</Empty>
  const selected = board.pitchers.find(p => p.id === id) ?? null
  const detail = selected ? await getStuffDetail(selected.id, season) : null
  return <StuffLab board={board} selected={selected} detail={detail} season={season} embedded />
}
