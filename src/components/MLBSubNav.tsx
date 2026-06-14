'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type AuthStatus = {
  authenticated: boolean
  is_pro: boolean
}

const NAV_ITEMS = [
  {
    href: '/mlb',
    label: 'Today\'s Reads',
    icon: '⊕',
    pro: false,
    description: 'Game previews & edges',
  },
  {
    href: '/mlb/scores',
    label: 'Live Scores',
    icon: '▸',
    pro: false,
    description: 'Full slate & scores',
    badge: 'LIVE',
  },
  {
    href: '/fantasy',
    label: 'Fantasy Desk',
    icon: '§',
    pro: true,
    description: 'Streamers · Movers · Sleepers',
    badge: 'PRO',
  },
  {
    href: '/track-record',
    label: 'Past Games',
    icon: '◷',
    pro: false,
    description: 'Recent results & grades',
  },
  {
    href: '/mlb/articles',
    label: 'Articles',
    icon: '✦',
    pro: false,
    description: 'Analysis & deep dives',
  },
]

export default function MLBSubNav() {
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false, is_pro: false })

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => setAuth({ authenticated: data.authenticated === true, is_pro: data.is_pro === true }))
      .catch(() => {})
  }, [])

  return (
    <>
      <style>{`
        .subnav-scroll {
          display: flex;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .subnav-scroll::-webkit-scrollbar { display: none; }
        .subnav-item {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 18px;
          height: 40px;
          white-space: nowrap;
          text-decoration: none;
          border-right: 1px solid #e5e5e5;
          position: relative;
          transition: background 0.1s;
          flex-shrink: 0;
        }
        .subnav-item:first-child { padding-left: 24px; }
        .subnav-item:last-child { border-right: none; }
        .subnav-item:hover { background: #fafafa; }
        .subnav-item.active { background: #fff7ed; }
        .subnav-item.locked { opacity: 0.5; cursor: default; pointer-events: none; }
      `}</style>

      <div style={{
        borderBottom: '1px solid #e5e5e5',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div className="subnav-scroll">
          {NAV_ITEMS.map((item) => {
            const isLocked = item.pro && !auth.is_pro

            if (isLocked) {
              return (
                <Link
                  key={item.href}
                  href="/pricing"
                  className="subnav-item"
                  title="Pro feature — upgrade to unlock"
                >
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{item.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{item.label}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: '#fff',
                    background: '#f97316', borderRadius: 3,
                    padding: '1px 5px', letterSpacing: '0.3px'
                  }}>
                    PRO
                  </span>
                </Link>
              )
            }

            return (
              <Link key={item.href} href={item.href} className="subnav-item">
                <span style={{ fontSize: 11, color: '#f97316' }}>{item.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{item.label}</span>
                {item.badge === 'LIVE' && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: '#fff',
                    background: '#111827', borderRadius: 3,
                    padding: '1px 5px', letterSpacing: '0.3px',
                    animation: 'pulse 2s infinite'
                  }}>
                    LIVE
                  </span>
                )}
              </Link>
            )
          })}

          {/* Upgrade CTA — only shown when logged in but not pro */}
          {auth.authenticated && !auth.is_pro && (
            <Link href="/pricing" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 20px 0 16px', height: 40,
              textDecoration: 'none', flexShrink: 0,
              borderLeft: '1px solid #e5e5e5',
              background: '#fff7ed',
              marginLeft: 'auto',
            }}>
              <span style={{ fontSize: 11, color: '#f97316' }}>✦</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.3px' }}>
                Upgrade to Pro
              </span>
            </Link>
          )}
        </div>
      </div>
        </div>
      
    </>
  )
}