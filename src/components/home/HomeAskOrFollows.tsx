'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// Client island. Everyone's HTML contains the email ask (passed in as children, so the page stays cacheable). If this
// browser turns out to be signed in (private API /api/me/follows), the ask is replaced by the "Your follows" row.

type Item = { kind: 'team' | 'player'; name: string; chip: string; img: string; href: string; next: string | null }

export const NO_FOLLOWS_LINE = 'Follow a player from his page to see him here.'

const RULES: React.CSSProperties = { borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '16px 0', margin: '24px 0' }

export default function HomeAskOrFollows({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/follows', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.signedIn) setItems(j.items as Item[]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (items === null) return <>{children}</>

  return (
    <section aria-labelledby="follows-h" style={RULES}>
      <h2 id="follows-h" style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, letterSpacing: '.12em', color: '#FF5722', textTransform: 'uppercase' }}>Your follows</h2>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 15, color: '#5b5347' }}>{NO_FOLLOWS_LINE}</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px' }}>
          {items.map(it => (
            <Link key={it.href} href={it.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#1A1A1A', textDecoration: 'none', fontSize: 15 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.img} alt="" width={36} height={36} style={{ width: 36, height: 36, objectFit: 'contain', objectPosition: 'center bottom' }} />
              {it.kind === 'team' && <span style={{ fontSize: 12, fontWeight: 800 }}>{it.chip}</span>}
              <b>{it.name}</b>
              {it.next && <span style={{ fontSize: 13, color: '#8a8275' }}>{it.next}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
