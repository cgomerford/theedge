"use client"

import Link from 'next/link'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

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

const MLB_SUB_LINKS = [
  { href: '/mlb', label: 'Home' },
  { href: '/mlb/scores', label: 'Scores & Matchups' },
  { href: '/fantasy', label: 'Fantasy Desk', proFeature: true },
  { href: '/mlb/standings', label: 'Standings' },
  { href: '/track-record', label: 'Past Games' },
]

// ─── NFL Data ─────────────────────────────────────────────────────────────────

const NFL_DIVISIONS = [
  {
    label: 'AFC East',
    teams: [
      { slug: 'buf', name: 'Buffalo Bills' },
      { slug: 'mia', name: 'Miami Dolphins' },
      { slug: 'ne',  name: 'New England Patriots' },
      { slug: 'nyj', name: 'New York Jets' },
    ],
  },
  {
    label: 'AFC North',
    teams: [
      { slug: 'bal', name: 'Baltimore Ravens' },
      { slug: 'cin', name: 'Cincinnati Bengals' },
      { slug: 'cle', name: 'Cleveland Browns' },
      { slug: 'pit', name: 'Pittsburgh Steelers' },
    ],
  },
  {
    label: 'AFC South',
    teams: [
      { slug: 'hou', name: 'Houston Texans' },
      { slug: 'ind', name: 'Indianapolis Colts' },
      { slug: 'jax', name: 'Jacksonville Jaguars' },
      { slug: 'ten', name: 'Tennessee Titans' },
    ],
  },
  {
    label: 'AFC West',
    teams: [
      { slug: 'den', name: 'Denver Broncos' },
      { slug: 'kc',  name: 'Kansas City Chiefs' },
      { slug: 'lv',  name: 'Las Vegas Raiders' },
      { slug: 'lac', name: 'Los Angeles Chargers' },
    ],
  },
  {
    label: 'NFC East',
    teams: [
      { slug: 'dal', name: 'Dallas Cowboys' },
      { slug: 'nyg', name: 'New York Giants' },
      { slug: 'phi', name: 'Philadelphia Eagles' },
      { slug: 'wsh', name: 'Washington Commanders' },
    ],
  },
  {
    label: 'NFC North',
    teams: [
      { slug: 'chi', name: 'Chicago Bears' },
      { slug: 'det', name: 'Detroit Lions' },
      { slug: 'gb',  name: 'Green Bay Packers' },
      { slug: 'min', name: 'Minnesota Vikings' },
    ],
  },
  {
    label: 'NFC South',
    teams: [
      { slug: 'atl', name: 'Atlanta Falcons' },
      { slug: 'car', name: 'Carolina Panthers' },
      { slug: 'no',  name: 'New Orleans Saints' },
      { slug: 'tb',  name: 'Tampa Bay Buccaneers' },
    ],
  },
  {
    label: 'NFC West',
    teams: [
      { slug: 'ari', name: 'Arizona Cardinals' },
      { slug: 'lar', name: 'Los Angeles Rams' },
      { slug: 'sf',  name: 'San Francisco 49ers' },
      { slug: 'sea', name: 'Seattle Seahawks' },
    ],
  },
]

const NFL_SUB_LINKS = [
  { href: '/nfl', label: 'Home' },
  { href: '/nfl/scores', label: 'Scores & Matchups' },
  { href: '/nfl/standings', label: 'Standings' },
  { href: '/nfl/schedule', label: 'Schedule' },
]

// ─── MLB Mega Panel ───────────────────────────────────────────────────────────

function MLBMegaPanel({ onClose }: { onClose: () => void }) {
  const all = MLB_DIVISIONS.flatMap(d => d.teams).sort((a, b) => a.short.localeCompare(b.short))
  const cols = 5
  const perCol = Math.ceil(all.length / cols)
  const columns = Array.from({ length: cols }, (_, ci) => all.slice(ci * perCol, (ci + 1) * perCol))

  return (
    <div
      className="absolute top-full left-0 right-0 bg-white border-b border-stone-200 shadow-xl z-50"
      onMouseLeave={onClose}
    >
      <div className="border-b border-stone-100 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center gap-8 h-12">
          {MLB_SUB_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={onClose}
              className="group flex items-center gap-1.5 font-sans font-bold text-[13px] text-stone-900 hover:text-[#FF5722] transition">
              {link.label}
              {link.proFeature && (
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

// ─── NFL Mega Panel ───────────────────────────────────────────────────────────

function NFLMegaPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute top-full left-0 right-0 bg-white border-b border-stone-200 shadow-xl z-50"
      onMouseLeave={onClose}
    >
      {/* Sub-nav */}
      <div className="border-b border-stone-100 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center gap-8 h-12">
          {NFL_SUB_LINKS.map(link => (
            <Link key={link.href} href={link.href} onClick={onClose}
              className="font-sans font-bold text-[13px] text-stone-900 hover:text-[#FF5722] transition">
              {link.label}
            </Link>
          ))}
          <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-stone-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
            Season starts Sep 9, 2026
          </span>
        </div>
      </div>

      {/* 8-division grid */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-6">
          {NFL_DIVISIONS.map(div => (
            <div key={div.label}>
              <div className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-3 pb-1 border-b border-stone-100">
                {div.label}
              </div>
              <div className="flex flex-col gap-2.5">
                {div.teams.map(team => (
                  <Link
                    key={team.slug}
                    href={`/nfl/teams/${team.slug}`}
                    onClick={onClose}
                    className="flex items-center gap-2 group"
                  >
                    <img
                      src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.slug}.png`}
                      alt=""
                      className="w-5 h-5 object-contain shrink-0"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <span className="font-sans text-[12px] text-stone-700 group-hover:text-stone-900 group-hover:underline transition leading-tight">
                      {team.name.split(' ').slice(-1)[0]}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Mobile Drawer ────────────────────────────────────────────────────────────

function MobileDrawer({ open, onClose, isLoggedIn, isPro }: {
  open: boolean
  onClose: () => void
  isLoggedIn: boolean
  isPro: boolean
}) {
  const [mlbOpen, setMlbOpen] = useState(false)
  const [nflOpen, setNflOpen] = useState(false)
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
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#111110', display: 'flex', flexDirection: 'column', overflowY: 'auto'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2A2A28', flexShrink: 0 }}>
        <Link href="/" onClick={onClose} className="font-serif font-black text-xl text-white tracking-tight">
          The Edge<span style={{ color: '#FF5722' }}>.</span>
        </Link>
        <div className="flex items-center gap-3">
          {!isLoggedIn && (
            <Link href="/pricing" onClick={onClose} className="font-mono text-[10px] uppercase tracking-widest bg-[#FF5722] text-white px-3 py-2 font-bold">
              Free daily reports
            </Link>
          )}
          <button type="button" onClick={onClose} style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="1" y1="1" x2="17" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="17" y1="1" x2="1" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Auth */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid #2A2A28' }}>
        {isLoggedIn ? (
          <Link href="/dugout" onClick={onClose} className="block font-serif text-white text-lg py-2 hover:text-[#FF5722] transition">My Dugout</Link>
        ) : (
          <>
            <Link href="/login" onClick={onClose} className="block font-serif text-white text-lg py-2 hover:text-[#FF5722] transition">Log in</Link>
            <Link href="/pricing" onClick={onClose} className="block font-serif text-white text-lg py-2 hover:text-[#FF5722] transition">Subscribe Now</Link>
          </>
        )}
      </div>

      {/* Nav items */}
      <div style={{ padding: '8px 20px', flex: 1 }}>

        {/* MLB accordion */}
        <button
          onClick={() => { setMlbOpen(o => !o); setNflOpen(false) }}
          className="w-full flex items-center justify-between py-3.5 border-b border-[#2A2A28]"
        >
          <span className="font-serif text-white text-lg">MLB</span>
          <svg width="14" height="9" viewBox="0 0 14 9" fill="none" className={`transition-transform text-stone-400 ${mlbOpen ? 'rotate-180' : ''}`}>
            <path d="M1 1l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {mlbOpen && (
          <div className="py-3 pl-3 border-b border-[#2A2A28]">
            {MLB_SUB_LINKS.map(link => (
              <Link key={link.href} href={link.href} onClick={onClose}
                className="block font-serif text-stone-300 text-base py-2 hover:text-white transition">
                {link.label}
                {link.label === 'Fantasy Desk' && !isPro && (
                  <span className="ml-2 text-[9px] font-mono text-stone-500">PRO</span>
                )}
              </Link>
            ))}
            <div className="mt-3 space-y-4">
              {MLB_DIVISIONS.map(div => (
                <div key={div.label}>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1.5">{div.label}</div>
                  {div.teams.map(team => (
                    <Link key={team.slug} href={`/mlb/teams/${team.slug}`} onClick={onClose}
                      className="flex items-center gap-2.5 py-1.5 group">
                      <img src={`https://www.mlbstatic.com/team-logos/${MLB_TEAM_IDS[team.slug]}.svg`} alt=""
                        className="w-5 h-5 object-contain shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      <span className="font-serif text-[13px] text-stone-300 group-hover:text-white transition">{team.short}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NFL accordion */}
        <button
          onClick={() => { setNflOpen(o => !o); setMlbOpen(false) }}
          className="w-full flex items-center justify-between py-3.5 border-b border-[#2A2A28]"
        >
          <div className="flex items-center gap-3">
            <span className="font-serif text-white text-lg">NFL</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-orange-500 border border-orange-500/30 px-1.5 py-0.5 rounded-sm">
              Sep 9
            </span>
          </div>
          <svg width="14" height="9" viewBox="0 0 14 9" fill="none" className={`transition-transform text-stone-400 ${nflOpen ? 'rotate-180' : ''}`}>
            <path d="M1 1l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {nflOpen && (
          <div className="py-3 pl-3 border-b border-[#2A2A28]">
            {NFL_SUB_LINKS.map(link => (
              <Link key={link.href} href={link.href} onClick={onClose}
                className="block font-serif text-stone-300 text-base py-2 hover:text-white transition">
                {link.label}
              </Link>
            ))}
            <div className="mt-3 space-y-4">
              {NFL_DIVISIONS.map(div => (
                <div key={div.label}>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-stone-500 mb-1.5">{div.label}</div>
                  {div.teams.map(team => (
                    <Link key={team.slug} href={`/nfl/teams/${team.slug}`} onClick={onClose}
                      className="flex items-center gap-2.5 py-1.5 group">
                      <img
                        src={`https://a.espncdn.com/i/teamlogos/nfl/500/${team.slug}.png`}
                        alt=""
                        className="w-5 h-5 object-contain shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                      <span className="font-serif text-[13px] text-stone-300 group-hover:text-white transition">
                        {team.name.split(' ').slice(-1)[0]}
                      </span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other nav items */}
        {[
          { href: '/about',        label: 'About',          sub: '' },
          { href: '/why-edge',     label: 'Why The Edge',   sub: '' },
          { href: '/pricing',      label: 'Pricing',        sub: '' },
          { href: '/track-record', label: 'Past Games',     sub: '' },
        ].map(link => (
          <Link key={link.href} href={link.href} onClick={onClose}
            className="flex items-center justify-between py-3.5 border-b border-[#2A2A28] group">
            <span className="font-serif text-white text-lg group-hover:text-[#FF5722] transition">{link.label}</span>
            {link.sub && <span className="font-mono text-[10px] text-stone-500 uppercase">{link.sub}</span>}
          </Link>
        ))}
      </div>
    </div>,
    document.body
  )
}

// ─── SiteHeader ───────────────────────────────────────────────────────────────

type Props = { variant?: 'home' | 'page' }

export default function SiteHeader({ variant = 'page' }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mlbOpen, setMlbOpen]       = useState(false)
  const [nflOpen, setNflOpen]       = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isPro, setIsPro]           = useState(false)

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const mlbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nflTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (nflTimerRef.current) clearTimeout(nflTimerRef.current)
    setNflOpen(false)
    setMlbOpen(true)
  }
  const closeMlb = () => {
    mlbTimerRef.current = setTimeout(() => setMlbOpen(false), 150)
  }

  // NFL hover handlers
  const openNfl = () => {
    if (nflTimerRef.current) clearTimeout(nflTimerRef.current)
    if (mlbTimerRef.current) clearTimeout(mlbTimerRef.current)
    setMlbOpen(false)
    setNflOpen(true)
  }
  const closeNfl = () => {
    nflTimerRef.current = setTimeout(() => setNflOpen(false), 150)
  }

  return (
    <>
      <header className="relative z-40 border-b bg-[#FAF8F3] border-[#E8E4DC]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">

            {/* LEFT: Hamburger + Logo + Nav */}
            <div className="flex items-center flex-1">

              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="flex flex-col justify-center items-center w-8 h-8 gap-[5px] hover:opacity-60 transition shrink-0 mr-3 md:mr-4"
              >
                <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
                <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
                <span className="block w-[18px] h-px bg-stone-900 rounded-full" />
              </button>

              <Link
                href="/"
                className="font-serif font-black text-2xl tracking-tight text-stone-900 hover:opacity-70 transition flex items-baseline shrink-0"
                style={{ fontFamily: 'Fraunces, serif' }}
              >
                The Edge<span className="text-[#FF5722]">.</span>
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

                {/* NFL dropdown */}
                <div className="relative h-full flex items-center" onMouseEnter={openNfl} onMouseLeave={closeNfl}>
                  <button className={`py-2 font-sans text-[14px] transition flex items-center gap-1.5 ${nflOpen ? 'text-stone-900 font-bold' : 'text-stone-500 hover:text-stone-900'}`}>
                    NFL
                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={`transition-transform ${nflOpen ? 'rotate-180' : ''}`}>
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <Link href="/about"        className="py-2 font-sans text-[14px] text-stone-500 hover:text-stone-900 transition whitespace-nowrap">About</Link>
                <Link href="/why-edge"     className="py-2 font-sans text-[14px] text-stone-500 hover:text-stone-900 transition whitespace-nowrap">Why the Edge</Link>
                <Link href="/pricing"      className="py-2 font-sans text-[14px] text-stone-500 hover:text-stone-900 transition whitespace-nowrap">Pricing</Link>
                <Link href="/track-record" className="py-2 font-sans text-[14px] text-stone-500 hover:text-stone-900 transition whitespace-nowrap">Past Games</Link>
              </nav>
            </div>

            {/* RIGHT: Auth */}
            <div className="flex items-center gap-4 ml-auto pl-4 shrink-0">
              {isLoggedIn ? (
                <Link href="/dugout" className="font-sans text-[13px] font-bold text-stone-900 hover:text-[#FF5722] transition whitespace-nowrap">
                  My Dugout
                </Link>
              ) : (
                <>
                  <Link href="/login" className="font-sans text-[13px] font-bold text-stone-900 hover:text-[#FF5722] transition hidden sm:block whitespace-nowrap">
                    Log in
                  </Link>
                  <Link href="/pricing" className="font-sans text-[13px] font-bold bg-[#FF5722] text-white px-4 py-2 hover:bg-orange-700 transition rounded-sm whitespace-nowrap">
                    Free daily reports
                  </Link>
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

        {/* NFL mega panel */}
        {nflOpen && (
          <div onMouseEnter={openNfl} onMouseLeave={closeNfl}>
            <NFLMegaPanel onClose={() => setNflOpen(false)} />
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