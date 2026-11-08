'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/levels/page.tsx
//
// Pitching Lab → Levels: this pitcher at MLB, Triple-A and the Florida State League side by side (shape, mix, location, sequencing, results). It reads the pitcher id from the address,
// not from the MLB season data the other tabs wait for, so a pitcher who has only pitched in the minors opens too. Open to everyone for what the free pitch log carries; sequencing
// needs the full log and says so when it is not open to the viewer. See components/pitching-lab/LevelsLab.tsx.

import { useParams } from 'next/navigation'
import LevelsLab from '@/components/pitching-lab/LevelsLab'

export default function LevelsPage() {
  const id = Number(useParams().playerId)
  return Number.isInteger(id) && id > 0 ? <LevelsLab id={id} /> : null
}
