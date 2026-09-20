// src/app/mlb/pitching-lab/[playerId]/layout.tsx
//
// SERVER layout: the Pro gate for every /mlb/pitching-lab/[playerId]/* page. The
// lab UI itself (LabShell.tsx — the old client layout, unchanged) only renders
// for Pro members; everyone else gets the locked screen and none of the lab's
// client code or data requests run. The lab's data APIs are gated separately
// (lib/require-pro.ts), so bypassing this page doesn't reach the data either.

import { isProViewer } from '@/lib/require-pro'
import LabLocked from '@/components/LabLocked'
import LabShell from './LabShell'

export default async function PitchingLabGate({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  if (!(await isProViewer())) return <LabLocked lab="pitching" playerId={Number(playerId) || 0} />
  return <LabShell>{children}</LabShell>
}
