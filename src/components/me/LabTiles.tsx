// src/components/me/LabTiles.tsx: "Labs quick launch": five tiles. A tile whose page does not exist yet says "Coming soon" and is not a link; nothing is faked. PRO tags as designed.
import { CARD, EYEBROW, GREY, C, SANS } from './ui'

type Lab = { title: string; pro: boolean; blurb: string; href: string | null }
const LABS: Lab[] = [
  { title: 'Share Card', pro: false, blurb: 'Make a card for a follow', href: null },
  { title: 'Season in 60 Seconds', pro: false, blurb: 'Recap per player', href: null },
  { title: 'Changes tracker', pro: true, blurb: 'What moved, with n shown', href: null },
  { title: 'My Team Weekly', pro: true, blurb: 'Weekly email + Pitch Watch', href: null },
  { title: 'Game Day Card', pro: true, blurb: 'In season, per game', href: null },
]

export default function LabTiles() {
  return (
    <section aria-labelledby="labs-h" style={{ marginTop: 22 }}>
      <h2 id="labs-h" style={{ ...EYEBROW, margin: '0 0 10px' }}>Labs quick launch</h2>
      <div className="me-labs">
        {LABS.map(l => {
          const body = (
            <>
              <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.2, fontFamily: SANS }}>{l.title}</div>
              {l.pro && <span style={{ display: 'inline-block', margin: '6px 0 0', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: C.orange, border: `1px solid ${C.orange}`, borderRadius: 4, padding: '1px 6px' }}>PRO</span>}
              <div style={{ fontSize: 12.5, color: GREY, marginTop: 6, lineHeight: 1.4 }}>{l.blurb}</div>
              {!l.href && <div style={{ fontSize: 11.5, fontWeight: 800, color: GREY, marginTop: 8 }}>Coming soon</div>}
            </>
          )
          return l.href
            ? <a key={l.title} href={l.href} style={{ ...CARD, padding: 14, color: 'inherit', textDecoration: 'none', display: 'block' }}>{body}</a>
            : <div key={l.title} style={{ ...CARD, padding: 14 }}>{body}</div>
        })}
      </div>
    </section>
  )
}
