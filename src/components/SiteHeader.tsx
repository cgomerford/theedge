import Link from 'next/link'

type Props = {
  variant?: 'home' | 'page'
}

export default function SiteHeader({ variant = 'page' }: Props) {
  return (
    <header className="border-b border-stone-200 bg-stone-50">
      <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="font-serif font-black text-xl tracking-tight text-stone-900 hover:opacity-70 transition flex items-baseline"
        >
          The Edge<span className="text-orange-600">.</span>
        </Link>
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
    </header>
  )
}