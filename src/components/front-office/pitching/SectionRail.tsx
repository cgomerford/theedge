'use client'

// Section index for the Pitching Desk, in two shapes that share one scroll-spy:
//   <SectionRail>  sticky left rail (>= 900px): every section AND every tool, with the current one highlighted
//   <SectionChips> a horizontally scrolling chip row for phones, where the rail is hidden
// "Where am I": the scroll-spy marks the last section/tool whose top has passed the sticky bars, and a click marks its
// target immediately (scroll updates are paused for a moment so the highlight doesn't flicker on the way there).
// Pro tools a free viewer does not have are shown with a PRO tag and jump to their section's upgrade card instead.
// Ids must match the section ids (s0..s4) and the ChartCard ids used on the page.

import { useEffect, useRef, useState } from 'react'
import { C, MONO, SANS } from '@/components/team/ui'

type Kid = { id: string; label: string; pro?: boolean }
type Sec = { id: string; num: string; label: string; kids: Kid[] }

export const SECTIONS: Sec[] = [
  { id: 's0', num: '00', label: 'Staff board', kids: [{ id: 'staff-board', label: 'Staff board' }, { id: 'process-vs-results', label: 'Process vs results' }] },
  { id: 's1', num: '01', label: 'Stuff & shape', kids: [{ id: 'arsenal', label: 'Arsenal' }, { id: 'movement', label: 'Movement profile', pro: true }, { id: 'release', label: 'Release point', pro: true }, { id: 'shape-comps', label: 'Shape comps', pro: true }] },
  { id: 's2', num: '02', label: 'Execution & results', kids: [{ id: 'era-estimators', label: 'ERA vs estimators', pro: true }, { id: 'luck-check', label: 'Luck check', pro: true }, { id: 'location', label: 'Location by pitch', pro: true }, { id: 'discipline', label: 'Command & discipline', pro: true }, { id: 'count-mix', label: 'Pitch mix by count', pro: true }, { id: 'rolling-form', label: 'Rolling form', pro: true }] },
  { id: 's3', num: '03', label: 'Durability & trajectory', kids: [{ id: 'velo-by-appearance', label: 'Velocity by appearance', pro: true }, { id: 'tto', label: 'Times through order', pro: true }, { id: 'velo-within-start', label: 'Within an outing', pro: true }, { id: 'workload', label: 'Workload', pro: true }, { id: 'arm-angle-trend', label: 'Arm angle trend', pro: true }] },
  { id: 's4', num: '04', label: 'Coming next', kids: [] },
]

const LINE = 330   // px from the top of the viewport: an item is "current" once its top has passed this line

function useActive() {
  const [active, setActive] = useState<string>('s0')
  const lockUntil = useRef(0)   // a ref, not state: changing it must not re-run the scroll effect

  useEffect(() => {
    const order = SECTIONS.flatMap(s => [s.id, ...s.kids.map(k => k.id)])
    let raf = 0
    const compute = () => {
      let cur: string | null = null, best = -Infinity
      for (const id of order) {
        const el = document.getElementById(id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top <= LINE && top > best + 2) { cur = id; best = top }   // ties (two cards in one row) keep the first
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = 's4'
      setActive(cur ?? 's0')
    }
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return
      cancelAnimationFrame(raf); raf = requestAnimationFrame(compute)
    }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [])

  const go = (id: string) => { setActive(id); lockUntil.current = Date.now() + 1100 }
  const sectionOf = (id: string) => SECTIONS.find(s => s.id === id || s.kids.some(k => k.id === id))?.id ?? 's0'
  return { active, go, activeSection: sectionOf(active) }
}

const head: React.CSSProperties = { fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, margin: '0 0 8px' }

export function SectionRail({ isPro }: { isPro: boolean }) {
  const { active, go, activeSection } = useActive()
  return (
    <aside className="pd-rail" aria-label="Sections">
      <nav style={{ position: 'sticky', top: 132, maxHeight: 'calc(100vh - 150px)', overflowY: 'auto', paddingRight: 6 }}>
        <h6 style={head}>On this page</h6>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {SECTIONS.map(s => {
            const secOn = activeSection === s.id
            return (
              <li key={s.id} style={{ marginBottom: 6 }}>
                <a href={`#${s.id}`} onClick={() => go(s.id)} aria-current={active === s.id ? 'location' : undefined}
                  style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 8px', borderRadius: 8, textDecoration: 'none', fontFamily: SANS, fontSize: 13.5, fontWeight: 800, color: secOn ? C.ink : '#6b6457', background: active === s.id ? '#FFF3E8' : 'transparent', borderLeft: `3px solid ${secOn ? C.orange : 'transparent'}` }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 400, color: C.orange, width: 16 }}>{s.num}</span>{s.label}
                </a>
                {s.kids.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: '0 0 0 33px' }}>
                    {s.kids.map(k => {
                      const locked = !!k.pro && !isPro
                      const on = active === k.id
                      return (
                        <li key={k.id}>
                          <a href={`#${locked ? s.id : k.id}`} onClick={() => go(locked ? s.id : k.id)} aria-current={on ? 'location' : undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, textDecoration: 'none', fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? C.orange : locked ? C.faint : '#5b5347', background: on ? '#FFF3E8' : 'transparent' }}>
                            <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', background: on ? C.orange : '#d8d2c4', flexShrink: 0 }} />
                            {k.label}
                            {locked && <span style={{ fontFamily: MONO, fontSize: 8, background: C.yellow, color: C.ink, borderRadius: 3, padding: '0 3px', marginLeft: 'auto' }}>PRO</span>}
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </aside>
  )
}

export function SectionChips() {
  const { go, activeSection } = useActive()
  return (
    <nav className="pd-chips" aria-label="Sections">
      {SECTIONS.map(s => (
        <a key={s.id} href={`#${s.id}`} onClick={() => go(s.id)} aria-current={activeSection === s.id ? 'location' : undefined}
          style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: '7px 11px', borderRadius: 4, textDecoration: 'none', border: `1px solid ${activeSection === s.id ? C.ink : C.line}`, background: activeSection === s.id ? C.ink : '#fff', color: activeSection === s.id ? C.cream : C.ink }}>
          {s.num} {s.label}
        </a>
      ))}
    </nav>
  )
}
