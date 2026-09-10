// src/components/nfl/TrendingReads.tsx

'use client'

import Link from 'next/link'
import type { EditorialPost } from '@/lib/nfl/queries'

export function TrendingReads({ posts }: { posts: EditorialPost[] }) {
  return (
    <section className="nh-leaders-league" style={{ margin: 0, padding: 0 }}>
              <div className="nh-league-head">
        <div>
          <p className="nh-kicker">§ Trending Reads</p>
          <h2>What&apos;s worth reading right now.</h2>
        </div>
      </div>
      {posts.length === 0 ? (
        <p className="nh-empty">More reads coming soon.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 16 }}>
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/nfl/articles/${p.slug}`}
              style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 14, textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <p style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, lineHeight: 1.3, margin: '0 0 6px', color: '#1A1A1A' }}>
                {p.title}
              </p>
              <p style={{ fontSize: 12, color: '#4B4B4B', lineHeight: 1.4, margin: '0 0 8px' }}>{p.snippet}</p>
              {p.readMinutes != null ? (
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', margin: 0 }}>
                  {p.readMinutes} min read
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}