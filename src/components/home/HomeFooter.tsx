import Link from 'next/link'

export default function HomeFooter() {
  return (
    <footer className="px-6 py-12 border-t border-stone-200 bg-[#fafaf9] text-[10px] text-stone-500 font-mono uppercase tracking-widest">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap gap-x-8 gap-y-4 mb-8">
          <Link href="/tonight" className="hover:text-stone-900 transition">
            Live Board
          </Link>
          <Link href="/track-record" className="hover:text-stone-900 transition">
            Track Record
          </Link>
          <Link href="/about" className="hover:text-stone-900 transition">
            About
          </Link>
          <Link href="/how-it-works" className="hover:text-stone-900 transition">
            How it works
          </Link>
          <Link href="/privacy" className="hover:text-stone-900 transition">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-stone-900 transition">
            Terms
          </Link>
          <a href="mailto:hello@edgereportdaily.com" className="hover:text-stone-900 transition">
            Contact
          </a>
        </div>
        <div className="mb-4 text-stone-400">© 2026 The Edge · Unbiased Cross-Sport Modeling Feed</div>
        <div className="text-stone-400 leading-relaxed max-w-2xl normal-case tracking-normal">
          The Edge provides purely statistical raw metrics and programmatic model calculations. We
          do not offer or promote sports gambling advice, structured picks, or wagering
          recommendations.
        </div>
      </div>
    </footer>
  )
}