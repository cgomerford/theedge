// src/components/me/FollowsFeed.tsx: "For your follows": real transaction rows for followed clubs and players (source: MLB transactions) and an honest "Coming soon" for articles.
import type { FeedRow } from '@/lib/follows/feed'
import { CARD, EYEBROW, GREY, NUMS, C, dateShort } from './ui'

export default function FollowsFeed({ rows }: { rows: FeedRow[] }) {
  return (
    <section style={{ ...CARD, padding: 16 }} aria-label="For your follows">
      <h2 style={{ ...EYEBROW, color: '#1A1A1A', margin: 0 }}>For your follows</h2>
      <div style={{ marginTop: 8 }}>
        {rows.length === 0 && <div style={{ padding: '9px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5, color: GREY }}>No roster moves for your follows in the last 30 days.</div>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5, lineHeight: 1.4 }}>
            <span>{r.text} <span style={{ color: GREY, fontSize: 12, ...NUMS }}>({dateShort(r.date)})</span></span>
            <span style={{ color: GREY, fontSize: 12, textAlign: 'right', maxWidth: 70 }}>MLB transactions</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: `1px solid ${C.soft}`, fontSize: 13.5 }}>
          <span>Articles for your follows</span><span style={{ color: GREY, fontSize: 12.5 }}>Coming soon</span>
        </div>
      </div>
    </section>
  )
}
