"use client"

import XMark from '@/components/XMark'
import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import LabsMenu from '@/components/LabsMenu'
import PlayerSearch from '@/components/PlayerSearch'
import { useAccount } from '@/components/header/useAccount'
import { openSignup } from '@/components/signup/openSignup'
import { LABS_MENU, STATUS_LABEL } from '@/lib/nav/labsMenu'
import { MLB_TABS } from '@/lib/nav/mlbTabs'

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

// MLB links come from the one shared list (src/lib/nav/mlbTabs.ts).
const MLB_SUB_LINKS = MLB_TABS.map(t => ({ href: t.href, label: t.label, pro: false }))

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
  <span className="text-[9px] uppercase tracking-widest bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-sm group-hover:bg-[#FF5722]/10 group-hover:text-[#FF5722] transition">
    Pro
  </span>
)}
            </Link>
          ))}
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="gap-x-8 gap-y-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
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
// One header for the whole site: wordmark, the MLB tab (the only sport for now), search, and the account area.
// The account area resolves on the client from /api/auth/status (useAccount), so pages stay static/ISR.
// Desktop: 60px row. Mobile: 56px row with search, account and a menu button (the menu itself is the drawer above).

type Props = { variant?: 'home' | 'page' }

const INK = '#1A1A1A', LINE = '#E8E4DC', MUTED = '#57534E'
const FONT = 'var(--font-redhat), system-ui, sans-serif'

function ProTag() {
  return <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 10, letterSpacing: '.1em', color: '#FF5722', border: '1px solid #FF5722', padding: '1px 5px', borderRadius: 2, lineHeight: 1.3 }}>PRO</span>
}

function AccountArea({ mobile }: { mobile?: boolean }) {
  const acct = useAccount()
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [menu])

  // Loading: the signed-out footprint with the controls invisible, so nothing shifts and no wrong state flashes.
  if (acct.state === 'loading' || acct.state === 'signed-out') {
    const hide: React.CSSProperties = acct.state === 'loading' ? { visibility: 'hidden' } : {}
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, ...hide }} aria-hidden={acct.state === 'loading' || undefined}>
        <Link href="/login" className="x9h-dsk" style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: INK, textDecoration: 'none' }}>Sign in</Link>
        <button type="button" className="x9h-signup" onClick={() => openSignup('header')}
          style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: '#fff', background: '#FF5722', border: 0, borderRadius: 2, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Sign up
        </button>
      </div>
    )
  }

  const chip = (
    <button type="button" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu"
      style={{ width: 34, height: 34, borderRadius: '50%', background: INK, color: '#fff', border: 0, fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
      {acct.initials}
    </button>
  )
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Link href="/me" className="x9h-dsk" style={{ fontFamily: FONT, fontSize: 13, color: MUTED, textDecoration: 'none' }}>Following</Link>
      {acct.state === 'pro' && <ProTag />}
      {chip}
      {menu && (
        <div role="menu" style={{ position: 'absolute', top: 42, right: 0, minWidth: 170, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 2, zIndex: 60, padding: '4px 0' }}>
          <Link role="menuitem" href="/me" onClick={() => setMenu(false)} style={{ display: 'block', padding: '9px 14px', fontFamily: FONT, fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none' }}>My x9Lab</Link>
          <form action="/api/auth/logout" method="POST">
            <button role="menuitem" type="submit" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontFamily: FONT, fontSize: 14, fontWeight: 600, color: INK, background: 'none', border: 0, borderTop: `1px solid ${LINE}`, cursor: 'pointer' }}>Sign out</button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function SiteHeader({ variant = 'page' }: Props) {
  void variant
  const pathname = usePathname()
  const acct = useAccount()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [mlbOpen, setMlbOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const mlbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aboutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openMlb = () => { if (mlbTimer.current) clearTimeout(mlbTimer.current); if (aboutTimer.current) clearTimeout(aboutTimer.current); setAboutOpen(false); setMlbOpen(true) }
  const closeMlb = () => { mlbTimer.current = setTimeout(() => setMlbOpen(false), 150) }
  const openAbout = () => { if (aboutTimer.current) clearTimeout(aboutTimer.current); if (mlbTimer.current) clearTimeout(mlbTimer.current); setMlbOpen(false); setAboutOpen(true) }
  const closeAbout = () => { aboutTimer.current = setTimeout(() => setAboutOpen(false), 150) }
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const mlbActive = pathname === '/' || pathname?.startsWith('/mlb')

  return (
    <>
      <style>{`
        .x9h{position:relative;z-index:50;background:#FAF8F3;border-bottom:1px solid ${LINE}}
        .x9h-row{display:flex;align-items:center;gap:12px;height:56px;padding:0 16px;max-width:1400px;margin:0 auto}
        .x9h-wm{display:flex;align-items:center;flex-shrink:0;text-decoration:none}
        .x9h-sports,.x9h-search{display:none}
        .x9h-right{margin-left:auto;display:flex;align-items:center;gap:12px}
        .x9h-ico{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;background:none;border:0;cursor:pointer;padding:0}
        .x9h-sub{display:block;padding:0 16px 10px}
        @media (min-width:768px){
          .x9h-row{height:60px;padding:0 32px;gap:28px}
          .x9h-sports{display:flex;align-self:stretch}
          .x9h-search{display:block;margin-left:auto;width:360px;max-width:36vw}
          .x9h-right{margin-left:0;gap:18px}
          .x9h-ico{display:none}
          .x9h-sub{display:none}
        }
        .x9h-tab{display:inline-flex;align-items:center;height:100%;padding:0;border-bottom:3px solid transparent;margin-bottom:-1px;font-family:${FONT};font-weight:800;font-size:15px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:${MUTED}}
        .x9h-tab[aria-current="page"]{color:${INK};border-bottom-color:#FF5722}
        .x9h-signup{padding:8px 12px}
        .x9h-dsk{display:none}
        .x9h-sports{gap:22px;align-items:stretch}
        .x9h-item{display:flex;align-items:center}
        .x9h-link{display:inline-flex;align-items:center;font-family:${FONT};font-weight:600;font-size:14px;color:${MUTED};text-decoration:none;background:none;border:0;padding:0;cursor:pointer}
        .x9h-link:hover{color:${INK}}
        .x9h-caret{display:inline-block;width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);margin-left:7px}
        .x9h-hide-d{display:inline-flex}
        @media (min-width:768px){.x9h-hide-d{display:none}.x9h-dsk{display:inline}.x9h-signup{padding:9px 16px;font-size:14px}}
      `}</style>
      <header className="x9h">
        <div className="x9h-row">
          <Link href="/" aria-label="x9Lab home" className="x9h-wm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/x9labs-mark.png" alt="x9Lab" style={{ height: 36, width: 'auto', display: 'block' }} />
          </Link>
          <nav className="x9h-sports" aria-label="Main">
            <div className="x9h-item" onMouseEnter={openMlb} onMouseLeave={closeMlb}>
              <Link href="/mlb" className="x9h-tab" aria-current={mlbActive ? 'page' : undefined} aria-expanded={mlbOpen}>MLB<span className="x9h-caret" aria-hidden="true" /></Link>
            </div>
            <Link href="/articles" className="x9h-link">Articles</Link>
            <div className="x9h-item"><LabsMenu /></div>
            <div className="x9h-item" style={{ position: 'relative' }} onMouseEnter={openAbout} onMouseLeave={closeAbout}>
              <button type="button" className="x9h-link x9h-btn" aria-expanded={aboutOpen}>About<span className="x9h-caret" aria-hidden="true" /></button>
              {aboutOpen && <AboutMegaPanel onClose={() => setAboutOpen(false)} />}
            </div>
          </nav>
          <div className="x9h-search"><PlayerSearch header sport="MLB" placeholder="Search players" /></div>
          <div className="x9h-right">
            <button type="button" className="x9h-ico x9h-hide-d" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen(o => !o)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" stroke={INK} strokeWidth="2" /><path d="M13 13l5 5" stroke={INK} strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <AccountArea mobile={false} />
            <button type="button" className="x9h-ico" aria-label={drawerOpen ? 'Close menu' : 'Open menu'} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(o => !o)}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                {drawerOpen ? <path d="M4 4l12 12M16 4L4 16" stroke={INK} strokeWidth="2" strokeLinecap="round" /> : <path d="M3 5h14M3 10h14M3 15h14" stroke={INK} strokeWidth="2" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
        </div>
        {searchOpen && <div className="x9h-sub"><PlayerSearch header autoFocus sport="MLB" placeholder="Search players" /></div>}
        {mlbOpen && (
          <div onMouseEnter={openMlb} onMouseLeave={closeMlb}>
            <MLBMegaPanel onClose={() => setMlbOpen(false)} />
          </div>
        )}
      </header>

      <MobileDrawer open={drawerOpen} onClose={closeDrawer} isLoggedIn={acct.state === 'free' || acct.state === 'pro'} isPro={acct.state === 'pro'} />
    </>
  )
}
