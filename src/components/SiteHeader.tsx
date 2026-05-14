// Replace src/components/SiteHeader.tsx

import Link from 'next/link'

type Props = {
  variant?: 'home' | 'page'
  activeSport?: 'mlb' | 'nfl' | 'nhl' | 'nba'
}

const SPORTS = [
  { id: 'mlb', label: 'MLB', href: '/tonight', live: true },
  { id: 'nfl', label: 'NFL', href: '#', live: false },
  { id: 'nhl', label: 'NHL', href: '#', live: false },
  { id: 'nba', label: 'NBA', href: '#', live: false },
] as const

export default function SiteHeader({ variant = 'page', activeSport = 'mlb' }: Props) {
  return (
    <header className="border-b border-stone-200 bg-stone-50">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link
          href="/"
          className="font-serif font-black text-xl tracking-tight text-stone-900 hover:opacity-70 transition flex items-baseline flex-shrink-0"
        >
          The Edge<span className="text-orange-600">.</span>
        </Link>

        {/* Sport switcher — centre */}
        <div className="flex items-center bg-stone-100 rounded-sm p-1 gap-1">
          {SPORTS.map(sport => (
            sport.live ? (
              <Link
                key={sport.id}
                href={sport.href}
                className={`px-4 py-1.5 text-[11px] font-mono uppercase tracking-widest transition rounded-sm whitespace-nowrap ${
                  activeSport === sport.id
                    ? 'bg-stone-900 text-stone-50'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200'
                }`}
              >
                {sport.label}
              </Link>
            ) : (
              <div key={sport.id} className="relative group">
                <span className="block px-4 py-1.5 text-[11px] font-mono uppercase tracking-widest text-stone-300 cursor-not-allowed whitespace-nowrap">
                  {sport.label}
                </span>
               
              </div>
            )
          ))}
        </div>

        {/* Right nav */}
        {variant === 'page' && (
          <nav className="flex items-center gap-4 text-xs font-mono uppercase tracking-widest text-stone-600 flex-shrink-0">
            <Link href="/" className="hover:text-stone-900 transition hidden sm:inline whitespace-nowrap">
              ← Tonight
            </Link>
            <Link href="/track-record" className="hover:text-stone-900 transition hidden lg:inline whitespace-nowrap">
              Track Record
            </Link>
            <Link href="/login" className="bg-stone-900 text-stone-50 px-3 py-1.5 hover:bg-stone-700 transition whitespace-nowrap">
              Sign in
            </Link>
          </nav>
        )}

        {variant === 'home' && (
          <nav className="flex items-center gap-4 text-xs font-mono uppercase tracking-widest text-stone-600 flex-shrink-0">
            <Link href="/track-record" className="hover:text-stone-900 transition hidden lg:inline whitespace-nowrap">Track Record</Link>
            <Link href="/about" className="hover:text-stone-900 transition hidden lg:inline whitespace-nowrap">About</Link>
            <Link href="/login" className="bg-stone-100 text-stone-900 px-3 py-1.5 hover:bg-yellow-300 transition whitespace-nowrap">
              Sign in
            </Link>
          </nav>
        )}

      </div>
    </header>
  )
}
