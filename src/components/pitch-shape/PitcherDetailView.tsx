'use client'

// src/components/pitch-shape/PitcherDetailView.tsx
//
// A pitcher's full read, the view the Pitch Shape Lab had before it was rebuilt: his pitch's full stat line, the carry-over banner for a minor-league pitcher, his average shape and what dialing it in could
// change, does his shape get results and do his own match it, his shape numbers and league window, and his pitch at each level. It is the original ShapePlayerDetail, unchanged; this wrapper only loads what that
// component was fed by the old finder (the Shape Score board, the league outcomes around his own average shape, the speed and arm-angle bins, his overall ranks and, for MLB Pro viewers, where he is leaking)
// in one server action (pitcherDetail) instead of five fetches. Opened from a pitcher's card or by clicking his dot on the map. Describes what happened; it is not a forecast.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C } from '@/components/team/ui'
import { ShapePlayerDetail } from './ShapeResultsKit'
import { pitcherDetail, type DetailBundle } from '@/app/mlb/lab/pitch-shape/actions'
import { makeResultsGrid, measuresOf, runsSaved, windowSumsRect } from '@/lib/pitch-shape/results-math'
import { limitsFor } from '@/lib/milb-shape/limits'
import { parseLevel } from '@/lib/milb-shape/levels'
import { headshotCutoutUrl } from '@/lib/mlb-assets'
import { log } from '@/lib/log'

export default function PitcherDetailView({ id, type, hand, level, pitchName, onClose }: { id: number; type: string; hand: 'R' | 'L'; level: string; pitchName: string; onClose: () => void }) {
  const router = useRouter()
  const [state, setState] = useState<{ bundle: DetailBundle } | 'loading' | 'none' | 'pro'>('loading')
  useEffect(() => {
    let live = true
    setState('loading')
    pitcherDetail({ id, type, hand, level })
      .then(r => { if (live) setState(r.ok ? { bundle: r.bundle } : r.error === 'pro' ? 'pro' : 'none') })
      .catch(e => { log.error('PitcherDetailView', 'pitcherDetail failed', e instanceof Error ? e.message : String(e)); if (live) setState('none') })
    return () => { live = false }
  }, [id, type, hand, level])

  const lim = limitsFor(parseLevel(level))
  const bundle = typeof state === 'object' ? state.bundle : null
  // what league pitches around any spot have produced, in runs saved per 100 pitches, from the outcomes the server sent: the same calculation the old finder did in the browser
  const shapeAt = useMemo(() => {
    if (!bundle?.results) return null
    const g = makeResultsGrid(bundle.results, 'all')
    const league = measuresOf(g.total, lim.gated)
    return (hb: number, ivb: number, rx10: number, ry10: number) => {
      const s = windowSumsRect(g, Math.round(hb * 10), Math.round(ivb * 10), rx10, ry10)
      const gated = measuresOf(s, lim.gated), raw = measuresOf(s, false)
      return { gated: { ...gated, saved: runsSaved(gated, league) }, raw: { ...raw, saved: runsSaved(raw, league) } }
    }
  }, [bundle, lim.gated])

  const box: React.CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 16px', marginTop: 18 }
  if (state === 'loading') return <div id="pitch-shape-detail" style={box}><div style={{ fontSize: 13, color: C.mute }}>Loading his full read…</div></div>
  if (state === 'pro') return <div id="pitch-shape-detail" style={box}><div style={{ fontSize: 13, color: C.mute }}>The full read for this pitch type is part of Pro.</div></div>
  if (state === 'none' || !bundle) return <div id="pitch-shape-detail" style={box}><div style={{ fontSize: 13, color: C.mute }}>There is no full read for this pitcher&apos;s {pitchName.toLowerCase()} yet: too few pitches, or it could not load. Nothing is estimated in its place. <button type="button" onClick={onClose} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Close</button></div></div>
  if (!bundle.board?.rows.some(r => r.pitcherId === id)) return <div id="pitch-shape-detail" style={box}><div style={{ fontSize: 13, color: C.mute }}>He does not have enough {pitchName.toLowerCase()}s to be on the Shape Score board, so there is no full read. A pitcher needs {lim.boardPitches}+ of the pitch to be listed. <button type="button" onClick={onClose} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Close</button></div></div>

  return (
    <div id="pitch-shape-detail" style={{ marginTop: 18 }}>
      <ShapePlayerDetail
        level={parseLevel(level)} board={bundle.board} selectedId={id} overall={bundle.overall} shapeAt={shapeAt} bins={bundle.bins} diagnosis={bundle.diagnosis}
        pitchType={type} season={bundle.season} exportMap={null} lc={pitchName.toLowerCase()} dialed={null} levelAvg={undefined} diag={null} leagueDiag={null} focusHand={hand}
        onSelect={x => { if (x == null) onClose() }} onOpen={pid => router.push(`/mlb/lab/pitching-lab/${pid}`)} headshot={pid => headshotCutoutUrl(pid, 240)} />
    </div>
  )
}
