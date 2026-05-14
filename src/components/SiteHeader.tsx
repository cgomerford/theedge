
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
      <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="font-serif font-black text-xl tracking-tight text-stone-900 hover:opacity-70 transition flex items-baseline"
        >
          The Edge<span className="text-orange-600">.</span>
        </Link>

        <div className="flex items-center gap-4">
          {/* Sport switcher — desktop only */}
          <div className="hidden md:flex items-center gap-1 bg-stone-100 rounded-sm p-0.5">
            {SPORTS.map(sport => (
              sport.live ? (
                <Link
                  key={sport.id}
                  href={sport.href}
                  className={`px-3 py-1 text-[11px] font-mono uppercase tracking-widest transition rounded-sm ${
                    activeSport === sport.id
                      ? 'bg-stone-900 text-stone-50'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {sport.label}
                </Link>
              ) : (
                <span
                  key={sport.id}
                  className="px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-stone-300 cursor-not-allowed relative group"
                  title="Coming soon"
                >
                  {sport.label}
                  {/* Tooltip */}
                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-stone-900 text-stone-100 text-[10px] font-mono px-2 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none rounded-sm">
                    Coming soon
                  </span>
                </span>
              )
            ))}
          </div>

          {/* Right nav */}
          {variant === 'page' && (
            <nav className="flex items-center gap-5 text-xs font-mono uppercase tracking-widest text-stone-600">
              <Link href="/" className="hover:text-stone-900 transition">
                ← Tonight
              </Link>
              <Link href="/track-record" className="hover:text-stone-900 transition hidden sm:inline">
                Track Record
              </Link>
              <Link href="/how-it-works" className="hover:text-stone-900 transition hidden sm:inline">
                How
              </Link>
              <Link href="/about" className="hover:text-stone-900 transition hidden sm:inline">
                About
              </Link>
              <Link href="/login" className="bg-stone-900 text-stone-50 px-3 py-1.5 hover:bg-stone-700 transition">
                Sign in
              </Link>
            </nav>
          )}

          {variant === 'home' && (
            <nav className="flex items-center gap-5 text-xs font-mono uppercase tracking-widest text-stone-600">
              <Link href="/track-record" className="hover:text-stone-900 transition hidden sm:inline">Track Record</Link>
              <Link href="/about" className="hover:text-stone-900 transition hidden sm:inline">About</Link>
              <Link href="/how-it-works" className="hover:text-stone-900 transition hidden sm:inline">How</Link>
              <Link href="/login" className="bg-stone-100 text-stone-900 px-3 py-1.5 hover:bg-yellow-300 transition">
                Sign in
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  )
}
