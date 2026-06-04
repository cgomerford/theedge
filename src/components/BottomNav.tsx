'use client'

// ──────────────────────────────────────────────────────────────────────
// src/components/BottomNav.tsx
//
// Mobile bottom tab bar for The Edge.
//
// SETUP:
//   1. npm install lucide-react
//   2. Drop this file into src/components/BottomNav.tsx
//   3. In root layout.tsx:
//        import BottomNav from '@/components/BottomNav'
//        ...after {children}:
//        <BottomNav />
//
// DEV AUTH:
//   In development, this defaults to the logged-in state so you can
//   test the authenticated nav without a real session cookie.
//   To test the logged-out nav in dev, change DEV_LOGGED_IN to false.
// ──────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Shield,
  CheckSquare,
  MoreVertical,
  Zap,
} from 'lucide-react'

// ─── Flip this to test logged-out nav in dev ───
const DEV_LOGGED_IN = true

// ─── Pages where the bottom nav hides ───
const HIDDEN_ON = ['/admin', '/preferences', '/login']

// ─── Icon size (consistent across all tabs) ───
const ICON_SIZE = 21
const ICON_STROKE = 1.8

// ──────────────────────────────────────────────────────────────────────
// Custom icon: baseball diamond
//
// Lucide doesn't have sport-specific icons, so we keep one custom SVG.
// A rotated square = the infield diamond shape. The dot = pitcher's mound.
// Clean, minimal, unmistakable as baseball at 21px.
// ──────────────────────────────────────────────────────────────────────
function IconDiamond() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-9 9 9 9 9-9z" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ─── Active indicator dot ───
function ActiveDot() {
  return (
    <span style={{
      position: 'absolute',
      top: 4,
      width: 4,
      height: 4,
      borderRadius: '50%',
      background: '#FF5722',
    }} />
  )
}

// ──────────────────────────────────────────────────────────────────────
// Tab definitions
// ──────────────────────────────────────────────────────────────────────

type Tab = {
  key: string
  label: string
  href: string | null
  match: string[]
  icon: React.ReactNode
}

const TABS_LOGGED_IN: Tab[] = [
  {
    key: 'dugout', label: 'Dugout', href: '/dugout', match: ['/dugout'],
    icon: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'mlb', label: 'MLB', href: '/mlb', match: ['/mlb', '/tonight'],
    icon: <IconDiamond />,
  },
  {
    key: 'nfl', label: 'NFL', href: '/nfl', match: ['/nfl'],
    icon: <Shield size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    // Points to /dugout for now — changes to /reads when Week 4 ships
    key: 'reads', label: 'My Reads', href: '/dugout', match: ['/reads'],
    icon: <CheckSquare size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'more', label: 'More', href: null, match: [],
    icon: <MoreVertical size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
]

const TABS_LOGGED_OUT: Tab[] = [
  {
    key: 'home', label: 'Home', href: '/', match: ['/'],
    icon: <Home size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'mlb', label: 'MLB', href: '/mlb', match: ['/mlb', '/tonight'],
    icon: <IconDiamond />,
  },
  {
    key: 'nfl', label: 'NFL', href: '/nfl', match: ['/nfl'],
    icon: <Shield size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'pricing', label: 'Pricing', href: '/pricing', match: ['/pricing'],
    icon: <Zap size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    key: 'more', label: 'More', href: null, match: [],
    icon: <MoreVertical size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
]

// ─── "More" panel links ───
const MORE_LINKS = [
  { href: '/track-record',  label: 'Track Record',  icon: '📊' },
  { href: '/how-it-works',  label: 'How It Works',  icon: '⊕' },
  { href: '/pricing',       label: 'Pricing',       icon: '⚡' },
  { href: '/about',         label: 'About',         icon: '§' },
  { href: '/faq',           label: 'FAQ',           icon: '?' },
]

// ──────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const pathname = usePathname()
  const isDev = process.env.NODE_ENV === 'development'
  const [isLoggedIn, setIsLoggedIn] = useState(isDev && DEV_LOGGED_IN)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    // In dev with DEV_LOGGED_IN=true, skip the auth call entirely
    // so there's no flash between logged-in and logged-out states.
    if (isDev && DEV_LOGGED_IN) return

    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => { setIsLoggedIn(data.authenticated === true) })
      .catch(() => { setIsLoggedIn(false) })
  }, [isDev])

  // Close the More panel whenever the user navigates
  useEffect(() => { setMoreOpen(false) }, [pathname])

  // Don't render on admin / onboarding / login pages
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
      {/* ─── More panel backdrop ─── */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          className="md:hidden"
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.35)',
          }}
        />
      )}

      {/* ─── More panel ─── */}
      {moreOpen && (
        <div
          className="md:hidden"
          style={{
            position: 'fixed',
            bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
            left: 0, right: 0,
            zIndex: 41,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 16px',
          }}
        >
          <div style={{
            background: '#1A1A1A',
            borderRadius: 14,
            padding: '6px 0',
            width: '100%',
            maxWidth: 360,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
          }}>
            {MORE_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMoreOpen(false)}
                className="font-mono"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 20px',
                  color: '#FAFAF9',
                  textDecoration: 'none',
                  fontSize: 13,
                  letterSpacing: '0.03em',
                }}
              >
                <span style={{ opacity: 0.5, fontSize: 16, width: 20, textAlign: 'center' }}>
                  {link.icon}
                </span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── The nav bar ─── */}
      <nav
        className="md:hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: '#1A1A1A',
          borderTop: '1px solid #333',
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
            const color = active ? '#FF5722' : '#A3A3A3'

            if (tab.key === 'more') {
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreOpen(prev => !prev)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color,
                    padding: 0,
                    position: 'relative',
                  }}
                >
                  {active && <ActiveDot />}
                  {tab.icon}
                  <span className="font-mono" style={{
                    fontSize: 9, letterSpacing: '0.1em',
                    textTransform: 'uppercase', marginTop: 1,
                  }}>
                    {tab.label}
                  </span>
                </button>
              )
            }

            return (
              <Link
                key={tab.key}
                href={tab.href!}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  color,
                  textDecoration: 'none',
                  position: 'relative',
                }}
              >
                {active && <ActiveDot />}
                {tab.icon}
                <span className="font-mono" style={{
                  fontSize: 9, letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginTop: 1,
                }}>
                  {tab.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ─── Bottom spacer ─── */}
      <div
        className="md:hidden"
        aria-hidden="true"
        style={{
          height: 60,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          flexShrink: 0,
        }}
      />
    </>
  )
}