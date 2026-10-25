'use client'

/**
 * src/components/BottomNav.tsx
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Target,
  MoreHorizontal,
  Info,
  DollarSign,
  Users,
  HelpCircle,
} from 'lucide-react'

const DEV_LOGGED_IN = true

const HIDDEN_ON = ['/admin', '/preferences', '/login', '/maintenance']

const ICON_SIZE   = 20
const ICON_STROKE = 1.75

// ─── Custom icons ─────────────────────────────────────────────────────────────

function IconDiamond() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={ICON_STROKE} strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-9 9 9 9 9-9z" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ─── Active dot ───────────────────────────────────────────────────────────────

function ActiveDot() {
  return (
    <span style={{
      position: 'absolute', top: 5,
      width: 3, height: 3, borderRadius: '50%',
      background: '#FF5722',
    }} />
  )
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = {
  key: string
  label: string
  href: string | null
  match: string[]
  icon: React.ReactNode
}

const TABS_LOGGED_IN: Tab[] = [
  {
    key: 'me', label: 'My x9Lab', href: '/me', match: ['/me'],
    icon: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'mlb', label: 'MLB', href: '/mlb', match: ['/mlb'],
    icon: <IconDiamond />,
  },
  {
    key: 'more', label: 'More', href: null, match: [],
    icon: <MoreHorizontal size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
]

const TABS_LOGGED_OUT: Tab[] = [
  {
    key: 'home', label: 'Home', href: '/', match: ['/'],
    icon: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'mlb', label: 'MLB', href: '/mlb', match: ['/mlb'],
    icon: <IconDiamond />,
  },
  {
    key: 'pricing', label: 'Pro', href: '/pricing', match: ['/pricing'],
    icon: <Target size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'more', label: 'More', href: null, match: [],
    icon: <MoreHorizontal size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
]

// ─── More panel links (Lucide icons — no emoji) ───────────────────────────────

const MORE_LINKS = [
  { href: '/how-it-works', label: 'How It Works', icon: <Info       size={15} strokeWidth={1.75} /> },
  { href: '/pricing',      label: 'Pricing',       icon: <DollarSign size={15} strokeWidth={1.75} /> },
  { href: '/about',        label: 'About',          icon: <Users      size={15} strokeWidth={1.75} /> },
  { href: '/faq',          label: 'FAQ',            icon: <HelpCircle size={15} strokeWidth={1.75} /> },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname = usePathname()
  const isDev = process.env.NODE_ENV === 'development'
  const [isLoggedIn, setIsLoggedIn] = useState(isDev && DEV_LOGGED_IN)
  const [moreOpen, setMoreOpen]     = useState(false)

  useEffect(() => {
    if (isDev && DEV_LOGGED_IN) return
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => { setIsLoggedIn(data.authenticated === true) })
      .catch(() => { setIsLoggedIn(false) })
  }, [isDev])

  useEffect(() => { setMoreOpen(false) }, [pathname])

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  const tabs = isLoggedIn ? TABS_LOGGED_IN : TABS_LOGGED_OUT

  function isTabActive(tab: Tab): boolean {
    if (tab.key === 'more') return moreOpen
    return tab.match.some(m => {
      if (m === '/') return pathname === '/'
      return pathname === m || pathname.startsWith(m + '/')
    })
  }

  return (
    <>
      {/* More panel backdrop */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          className="md:hidden"
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
      )}

      {/* More panel */}
      {moreOpen && (
        <div
          className="md:hidden"
          style={{
            position: 'fixed',
            bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
            left: 0, right: 0,
            zIndex: 41,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 16px',
          }}
        >
          <div style={{
            background: '#1A1A1A',
            borderRadius: 12,
            overflow: 'hidden',
            width: '100%',
            maxWidth: 340,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {MORE_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 20px',
                  color: '#E7E5E4',
                  textDecoration: 'none',
                  borderBottom: i < MORE_LINKS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
                className="hover:bg-white/5 transition"
              >
                <span style={{ opacity: 0.45, display: 'flex', alignItems: 'center' }}>
                  {link.icon}
                </span>
                <span
                  className="font-mono uppercase"
                  style={{ fontSize: 12, letterSpacing: '0.06em', color: '#D6D3D1' }}
                >
                  {link.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* The nav bar */}
      <nav
        className="md:hidden"
        style={{
          position: 'relative',
          background: '#1A1A1A',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-around',
          height: 60,
          maxWidth: 480,
          margin: '0 auto',
        }}>
          {tabs.map(tab => {
            const active = isTabActive(tab)
            const color  = active ? '#FF5722' : '#6B6560'

            const sharedStyle: React.CSSProperties = {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color,
              position: 'relative',
              textDecoration: 'none',
              padding: 0,
            }

            if (tab.key === 'more') {
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreOpen(prev => !prev)}
                  style={{ ...sharedStyle, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {active && <ActiveDot />}
                  {tab.icon}
                  <span className="font-mono" style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {tab.label}
                  </span>
                </button>
              )
            }

            return (
              <Link key={tab.key} href={tab.href!} style={sharedStyle}>
                {active && <ActiveDot />}
                {tab.icon}
                <span className="font-mono" style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

    </>
  )
}