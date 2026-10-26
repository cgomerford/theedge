"use client"

import XMark from '@/components/XMark'
import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import LabsMenu from '@/components/LabsMenu'
import { openSignup } from '@/components/signup/openSignup'
import { LABS_MENU, STATUS_LABEL } from '@/lib/nav/labsMenu'

// ─── MLB Data ─────────────────────────────────────────────────────────────────

const MLB_TEAM_IDS: Record<string, number> = {
  'yankees': 147, 'red-sox': 111, 'blue-jays': 141, 'orioles': 110, 'rays': 139,
  'guardians': 114, 'tigers': 116, 'royals': 118, 'twins': 142, 'white-sox': 145,
  'astros': 117, 'angels': 108, 'athletics': 133, 'mariners': 136, 'rangers': 140,
  'braves': 144, 'marlins': 146, 'mets': 121, 'phillies': 143, 'nationals': 120,
  'cubs': 112, 'reds': 113, 'brewers': 158, 'pirates': 134, 'cardinals': 138,
  'diamondbacks': 109, 'rockies': 115, 'dodgers': 119, 'padres': 135, 'giants': 137,
}

const MLB_DIVISIONS = [
  { label: 'AL East',    teams: [{ slug: 'yankees', short: 'New York Yankees' }, { slug: 'red-sox', short: 'Boston Red Sox' }, { slug: 'blue-jays', short: 'Toronto Blue Jays' }, { slug: 'orioles', short: 'Baltimore Orioles' }, { slug: 'rays', short: 'Tampa Bay Rays' }] },
  { label: 'AL Central', teams: [{ slug: 'guardians', short: 'Cleveland Guardians' }, { slug: 'tigers', short: 'Detroit Tigers' }, { slug: 'royals', short: 'Kansas City Royals' }, { slug: 'twins', short: 'Minnesota Twins' }, { slug: 'white-sox', short: 'Chicago White Sox' }] },
  { label: 'AL West',    teams: [{ slug: 'astros', short: 'Houston Astros' }, { slug: 'angels', short: 'Los Angeles Angels' }, { slug: 'athletics', short: 'Athletics' }, { slug: 'mariners', short: 'Seattle Mariners' }, { slug: 'rangers', short: 'Texas Rangers' }] },
  { label: 'NL East',    teams: [{ slug: 'braves', short: 'Atlanta Braves' }, { slug: 'marlins', short: 'Miami Marlins' }, { slug: 'mets', short: 'New York Mets' }, { slug: 'phillies', short: 'Philadelphia Phillies' }, { slug: 'nationals', short: 'Washington Nationals' }] },
  { label: 'NL Central', teams: [{ slug: 'cubs', short: 'Chicago Cubs' }, { slug: 'reds', short: 'Cincinnati Reds' }, { slug: 'brewers', short: 'Milwaukee Brewers' }, { slug: 'pirates', short: 'Pittsburgh Pirates' }, { slug: 'cardinals', short: 'St. Louis Cardinals' }] },
  { label: 'NL West',    teams: [{ slug: 'diamondbacks', short: 'Arizona D-Backs' }, { slug: 'rockies', short: 'Colorado Rockies' }, { slug: 'dodgers', short: 'Los Angeles Dodgers' }, { slug: 'padres', short: 'San Diego Padres' }, { slug: 'giants', short: 'San Francisco Giants' }] },
]

// Kept identical to MLBSubNav.tsx's MLB_NAV (same hrefs, labels, order,
// pro flags) — the main header's MLB dropdown and the MLB pages' own sub
// header must show the same links as each other, not two independently
// drifted lists (Articles has its own standalone top-level link already,
// so it's deliberately not repeated here).
const MLB_SUB_LINKS = [
  { href: '/mlb',              label: 'Home',           pro: false },
  { href: '/mlb/scores',       label: 'Scores',         pro: false },
  { href: '/mlb/stats',        label: 'Stats',          pro: false },
  { href: '/mlb/lab/pitching-lab', label: 'Pitching Lab',   pro: false },
  { href: '/mlb/lab/batting-lab',  label: 'Batting Lab' },
  { href: '/mlb/lab/contact',      label: 'Contact Lab',     pro: false },
  { href: '/mlb/lab/platoon',      label: 'Platoon Lab',     pro: false },
  { href: '/mlb/glossary',     label: 'Glossary',       pro: false },
]

// ─── About / More Data ────────────────────────────────────────────────────────
// Replaces four separate top-level links (About, Why the Edge, Pricing,
// Past Games) with one "About" dropdown — same consolidation the mobile
// drawer's "More" section already does, now mirrored on desktop instead of
// spreading five words of nav real estate across the header. "How It Works"
// folded in too since it was already grouped with these in the mobile
// drawer's "More" section — keeps desktop and mobile groupings consistent.
const ABOUT_SUB_LINKS = [
  { href: '/articles',     label: 'Articles' },
  { href: '/about',        label: 'About' },
  { href: '/why-edge',     label: 'Why x9Lab' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/pricing',      label: 'Pricing' },
]
// ─── MLB Mega Panel ───────────────────────────────────────────────────────────

function MLBMegaPanel({ onClose }: { onClose: () => void }) {
  const all = MLB_DIVISIONS.flatMap(d => d.teams).sort((a, b) => a.short.localeCompare(b.short))
  const cols = 5
  const perCol = Math.ceil(all.length / cols)
  const columns = Array.from({ length: cols }, (_, ci) => all.slice(ci * perCol, (ci + 1) * perCol))

  return (
    <div
  style={{
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#fff',
    borderBottom: '1px solid #e7e5e0',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    zIndex: 50,
  }}
  onMouseLeave={onClose}
>
      <div className="border-b border-stone-100 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center gap-8 h-12">
          {MLB_SUB_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={onClose}
              className="group flex items-center gap-1.5 font-sans font-bold text-[13px] text-stone-900 hover:text-[#FF5722] transition">
              {link.label}
             {link.pro && (
  <span className="text-[9px] font-mono uppercase tracking-widest bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-sm group-hover:bg-[#FF5722]/10 group-hover:text-[#FF5722] transition">
    Pro
  </span>
)}
            </Link>
          ))}
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-8 gap-y-2">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-y-3">
              {col.map(team => (
                <Link key={team.slug} href={`/mlb/teams/${team.slug}`} onClick={onClose}
                  className="flex items-center gap-3 group">
                  <img
                    src={`https://www.mlbstatic.com/team-logos/${MLB_TEAM_IDS[team.slug]}.svg`}
                    alt="" className="w-5 h-5 object-contain shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <span className="font-sans text-[13px] text-stone-700 group-hover:text-stone-900 group-hover:underline transition">
                    {team.short}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── About Dropdown Panel ─────────────────────────────────────────────────────
// Deliberately narrow and anchored to the button (unlike MLB's full-width
// mega panels, which need the width for team grids) — five short links in a
// full-width bar would look sparse and out of place.

function AboutMegaPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        minWidth: 210,
        background: '#fff',
        border: '1px solid #e7e5e0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        zIndex: 50,
      }}
      onMouseLeave={onClose}
    >
      <div className="py-2">
        {ABOUT_SUB_LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className="block px-4 py-2.5 font-sans text-[13px] text-stone-700 hover:text-stone-900 hover:bg-stone-50 transition whitespace-nowrap"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Mobile Drawer ────────────────────────────────────────────────────────────
// Full-screen overlay, Athletic-style. Replaces the side drawer.

// ─── Menu Panel (Athletic-style) ──────────────────────────────────────────────
// Drops below header as a white panel. Header stays visible.

function MobileDrawer({ open, onClose, isLoggedIn, isPro }: {
  open: boolean
  onClose: () => void
  isLoggedIn: boolean
  isPro: boolean
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <>
     {/* Backdrop — click to close, starts below header */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 64,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 48,
          background: 'rgba(0,0,0,0.08)',
        }}
      />

      {/* Panel — drops below the header, doesn't cover it */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
       style={{
          position: 'fixed',
          top: 64,
          left: 0,
          right: 0,
          zIndex: 49,
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          background: '#FAF8F3',
          borderTop: '1px solid #E2DCCF',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '32px 24px 48px',
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 0,
        }}>

          {/* ── On desktop: 4-col layout. On mobile: stacked ── */}
          <style dangerouslySetInnerHTML={{ __html: `
            .menu-grid { display: grid; grid-template-columns: 1fr; gap: 32px; }
            @media (min-width: 768px) { .menu-grid { grid-template-columns: 1fr 1fr 1fr 280px; gap: 40px; } }
          `}} />

          <div className="menu-grid">

            {/* ─── COL 1: MLB ─── */}
            <div>
              <div style={sectionHead}>
                <span style={{ color: '#FF5722', marginRight: 6 }}><XMark /></span> MLB
              </div>
              {MLB_SUB_LINKS.map(link => (
                <Link key={link.href} href={link.href} onClick={onClose} style={menuLink}>
                  {link.label}
                  {link.pro && !isPro && <span style={proBadge}>PRO</span>}
                </Link>
              ))}

              <div style={{ ...sectionHead, marginTop: 32 }}>
                <span style={{ color: '#FF5722', marginRight: 6 }}><XMark /></span> Labs
              </div>
              {LABS_MENU.map(item => (
                <Link key={item.href} href={item.href} onClick={onClose} style={menuLink}>
                  {item.label}
                  <span style={{ marginLeft: 8, fontFamily: 'var(--font-redhat), sans-serif', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8a8275' }}>
                    {item.badge ?? STATUS_LABEL[item.status]}
                  </span>
                </Link>
              ))}
              <div style={{ marginTop: 20 }}>
                {MLB_DIVISIONS.slice(0, 3).map(div => (
                  <div key={div.label} style={{ marginBottom: 16 }}>
                    <div style={divLabel}>{div.label}</div>
                    {div.teams.map(team => (
                      <Link key={team.slug} href={`/mlb/teams/${team.slug}`} onClick={onClose} style={teamRow}>
                        <img
                          src={`https://www.mlbstatic.com/team-logos/${MLB_TEAM_IDS[team.slug]}.svg`}
                          alt="" width={16} height={16}
                          style={{ objectFit: 'contain', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <span style={teamName}>{team.short}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* ─── COL 2: MLB continued (NL) ─── */}
            <div>
              <div style={{ ...sectionHead, color: 'transparent' }}>.</div>
              <div>
                {MLB_DIVISIONS.slice(3).map(div => (
                  <div key={div.label} style={{ marginBottom: 16 }}>
                    <div style={divLabel}>{div.label}</div>
                    {div.teams.map(team => (
                      <Link key={team.slug} href={`/mlb/teams/${team.slug}`} onClick={onClose} style={teamRow}>
                        <img
                          src={`https://www.mlbstatic.com/team-logos/${MLB_TEAM_IDS[team.slug]}.svg`}
                          alt="" width={16} height={16}
                          style={{ objectFit: 'contain', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <span style={teamName}>{team.short}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* ─── COL 3: More ─── */}
            <div>
              <div style={sectionHead}>
                <span style={{ color: '#FF5722', marginRight: 6 }}><XMark /></span> More
              </div>
              {ABOUT_SUB_LINKS.map(link => (
                <Link key={link.href} href={link.href} onClick={onClose} style={menuLink}>
                  {link.label}
                </Link>
              ))}
            </div>

            {/* ─── COL 4: Auth + utilities (right sidebar) ─── */}
            <div style={{ borderLeft: '1px solid #E2DCCF', paddingLeft: 32 }}>
              {isLoggedIn ? (
                <Link href="/me" onClick={onClose} style={authLink}>My page</Link>
              ) : (
                <>
                  <Link href="/login"   onClick={onClose} style={authLink}>Log In</Link>
                  <button type="button" onClick={() => { onClose(); openSignup('header') }} style={{ ...authLink, background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}>Sign up</button>
                </>
              )}

              <div style={{
                borderTop: '1px solid #E2DCCF', marginTop: 24, paddingTop: 24,
              }}>
                <div style={{
                  fontFamily: 'Red Hat Display, sans-serif', fontSize: 9,
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: '#8A8275', marginBottom: 12,
                }}>QUICK LINKS</div>
                <Link href="/mlb"           onClick={onClose} style={utilLink}>Tonight's Slate</Link>
<Link href="/mlb/stats"     onClick={onClose} style={utilLink}>Stats & Leaders</Link>
              </div>

            </div>

          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// ─── Style tokens for menu panel ──────────────────────────────────────────────

const sectionHead: React.CSSProperties = {
  fontFamily: 'Red Hat Display, sans-serif',
  fontSize: 11, fontWeight: 700,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: '#1A1A1A',
  marginBottom: 14,
  paddingBottom: 8,
  borderBottom: '2px solid #1A1A1A',
}

const menuLink: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontFamily: 'var(--font-redhat), sans-serif',
  fontSize: 15, color: '#1A1A1A',
  textDecoration: 'none',
  padding: '6px 0',
}

const proBadge: React.CSSProperties = {
  fontFamily: 'Red Hat Display, sans-serif',
  fontSize: 9, letterSpacing: '0.1em',
  color: '#FF5722', textTransform: 'uppercase',
}

const divLabel: React.CSSProperties = {
  fontFamily: 'Red Hat Display, sans-serif',
  fontSize: 9, letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#8A8275', marginBottom: 6,
}

const teamRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '4px 0', textDecoration: 'none',
}

const teamName: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13, color: '#57534E',
}

const authLink: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-redhat), sans-serif',
  fontSize: 17, fontWeight: 600,
  color: '#1A1A1A', textDecoration: 'none',
  padding: '8px 0',
}

const utilLink: React.CSSProperties = {
  display: 'block',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13, color: '#57534E',
  textDecoration: 'none',
  padding: '5px 0',
}



// ─── SiteHeader ───────────────────────────────────────────────────────────────

type Props = { variant?: 'home' | 'page' }

export default function SiteHeader({ variant = 'page' }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mlbOpen, setMlbOpen]       = useState(false)
  const [aboutOpen, setAboutOpen]   = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isPro, setIsPro]           = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const mlbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aboutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(d => {
        setIsLoggedIn(d.authenticated === true)
        setIsPro(d.is_pro === true)
      })
      .catch(() => {})
  }, [])

  // MLB hover handlers
  const openMlb = () => {
    if (mlbTimerRef.current) clearTimeout(mlbTimerRef.current)
    if (aboutTimerRef.current) clearTimeout(aboutTimerRef.current)
    setAboutOpen(false)
    setMlbOpen(true)
  }
  const closeMlb = () => {
    mlbTimerRef.current = setTimeout(() => setMlbOpen(false), 150)
  }

  // About hover handlers
  const openAbout = () => {
    if (aboutTimerRef.current) clearTimeout(aboutTimerRef.current)
    if (mlbTimerRef.current) clearTimeout(mlbTimerRef.current)
    setMlbOpen(false)
    setAboutOpen(true)
  }
  const closeAbout = () => {
    aboutTimerRef.current = setTimeout(() => setAboutOpen(false), 150)
  }

  return (
    <>
      <header style={{ position: 'relative', zIndex: 50, borderBottom: '1px solid #E8E4DC', background: '#FAF8F3' }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">

            {/* LEFT: Hamburger + Logo + Nav */}
            <div className="flex items-center flex-1">

              <button
                type="button"
                onClick={() => setDrawerOpen(o => !o)}
                aria-label="Open menu"
                className="flex flex-col justify-center items-center w-8 h-8 gap-[5px] hover:opacity-60 transition shrink-0 mr-3 md:mr-4"
              >
                <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
                <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
                <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
              </button>

              <Link
                href="/"
                aria-label="x9Lab home"
                className="hover:opacity-70 transition flex items-center shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/x9labs-mark.png" alt="x9Lab" height={40} style={{ height: 40, width: 'auto', display: 'block' }} />
              </Link>

              <div className="hidden md:block w-px h-6 bg-stone-300 mx-4 lg:mx-6 shrink-0" />

              <nav className="hidden md:flex items-center gap-4 lg:gap-6 flex-1">

                {/* MLB dropdown */}
                <div className="relative h-full flex items-center" onMouseEnter={openMlb} onMouseLeave={closeMlb}>
                  <button className={`py-2 font-sans text-[14px] transition flex items-center gap-1.5 ${mlbOpen ? 'text-stone-900 font-bold' : 'text-stone-500 hover:text-stone-900'}`}>
                    MLB
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={`transition-transform ${mlbOpen ? 'rotate-180' : ''}`}>
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>


{/* Articles — standalone link, not a dropdown */}
                <Link href="/articles" className="py-2 font-sans text-[14px] text-stone-500 hover:text-stone-900 transition">
                  Articles
                </Link>

                {/* Labs — one data array drives it (src/lib/nav/labsMenu.ts) */}
                <LabsMenu />

                {/* About dropdown — replaces separate About / Why the Edge / Pricing / Past Games links */}
                <div className="relative h-full flex items-center" onMouseEnter={openAbout} onMouseLeave={closeAbout}>
                  <button className={`py-2 font-sans text-[14px] transition flex items-center gap-1.5 ${aboutOpen ? 'text-stone-900 font-bold' : 'text-stone-500 hover:text-stone-900'}`}>
                    About
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={`transition-transform ${aboutOpen ? 'rotate-180' : ''}`}>
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {aboutOpen && <AboutMegaPanel onClose={() => setAboutOpen(false)} />}
                </div>
              </nav>
            </div>

            {/* RIGHT: Auth */}
            <div className="flex items-center gap-4 ml-auto pl-4 shrink-0">
              {isLoggedIn ? (
                <Link href="/me" className="font-sans text-[13px] font-bold text-stone-900 hover:text-[#FF5722] transition whitespace-nowrap">
                  My page
                </Link>
              ) : (
                <>
                  <Link href="/login" className="font-sans text-[13px] font-bold text-stone-900 hover:text-[#FF5722] transition hidden sm:block whitespace-nowrap">
                    Log in
                  </Link>
                  <button type="button" onClick={() => openSignup('header')} className="font-sans text-[13px] font-bold bg-[#FF5722] text-white px-4 py-2 hover:bg-orange-700 transition rounded-sm whitespace-nowrap">
                    Sign up
                  </button>
                </>
              )}
            </div>

          </div>
        </div>

        {/* MLB mega panel */}
        {mlbOpen && (
          <div onMouseEnter={openMlb} onMouseLeave={closeMlb}>
            <MLBMegaPanel onClose={() => setMlbOpen(false)} />
          </div>
        )}


      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        isLoggedIn={isLoggedIn}
        isPro={isPro}
      />
    </>
  )
}