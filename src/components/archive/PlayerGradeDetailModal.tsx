'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RosterPlayer } from '@/lib/lab'
import type { PlayerGrade } from '@/lib/team-grades'
import PercentileRing from './PercentileRing'

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

export default function PlayerGradeDetailModal({
  player, grade, teamColor, onClose,
}: { player: RosterPlayer; grade: PlayerGrade | undefined; teamColor: string; onClose: () => void }) {
  // Portal to document.body — same fix MobileDrawer already uses for the
  // same class of bug. Rendering this modal inline inside TeamDugoutView's
  // own tree meant `position: fixed` was resolving against whatever
  // ancestor establishes a containing block (a transform somewhere in the
  // page's scroll/animation wrapper is the usual culprit), so the backdrop
  // only covered part of the page instead of the full viewport.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', fn)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (!mounted) return null

  const ringed = grade?.statDetails.filter(s => s.ring) ?? []
  const plain = grade?.statDetails.filter(s => !s.ring) ?? []

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#FAF8F3', borderRadius: 16, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ background: teamColor, padding: '20px 24px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <img src={headshotUrl(player.id)} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', background: '#fff', border: '2px solid #fff' }} />
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: '#fff' }}>{player.fullName}</div>
            <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
              {player.primaryPosition} · {grade?.grade ? `Grade ${grade.grade}` : 'Sample too small to grade'}
            </div>
          </div>
          <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', opacity: 0.8 }}>✕</button>
        </div>

        <div style={{ padding: 24 }}>
        {ringed.length === 0 ? (
  <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
    Not enough playing time this season yet (min 10 PA/IP).
  </p>
) : (
  <>
    <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, marginBottom: 14 }}>
      Season line · percentile vs league
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 56px minmax(0,1fr) 56px', columnGap: 16, rowGap: 18, alignItems: 'center' }}>
      {ringed.map(s => (
        <>
          <div key={`${s.key}-info`}>
            <div style={{ fontSize: 9, color: '#a89e8c', textTransform: 'uppercase', letterSpacing: '.08em' }}>{s.label}</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: '#1A1A1A' }}>{s.value}</div>
          </div>
          <div key={`${s.key}-ring`} style={{ display: 'flex', justifyContent: 'center' }}>
            {s.percentile !== null && <PercentileRing percentile={s.percentile} size={48} />}
          </div>
        </>
      ))}
    </div>
  </>
)}

          {plain.length > 0 && (
            <>
              <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700, margin: '20px 0 12px', paddingTop: 16, borderTop: '1px solid #e7e2d8' }}>
                Additional stats
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {plain.map(s => (
                  <div key={s.key}>
                    <div style={{ fontSize: 9, color: '#a89e8c', textTransform: 'uppercase' }}>{s.label}</div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, color: '#1A1A1A' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}