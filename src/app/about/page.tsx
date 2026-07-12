export const metadata = {
  title: "About · The Edge",
  description: "Why The Edge exists, who's behind it, and what we believe about sports analytics.",
}

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900">
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] hover:underline">
          ← Back to home
        </Link>

        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-8 mb-2">§ About</div>
        <h1 className="text-5xl md:text-6xl font-serif font-light tracking-tight mb-12">
          About The Edge<span className="text-[#FF5722]">.</span>
        </h1>

        <div className="space-y-6 text-lg leading-relaxed text-stone-700 font-serif">
          <p>
            Sports media in 2026 is split into two camps. On one side, the data tools — Baseball Savant, NBA Stats, PFF — built for experts, full of insight, but offering no story and no daily ritual.
          </p>
          <p>
            On the other side, mainstream sports media — the takes, the highlights, the box scores. Easy to consume, but rarely teaches you anything you didn&apos;t already know.
          </p>
          <p>
            The Edge sits in the middle. We take the data the experts use, find the one or two stats that will actually matter in tonight&apos;s game, and tell you the story before first pitch. Five minutes. Free. Every day.
          </p>
          <p>
            We&apos;re built for fans who want to watch smarter, journalists who want angles their colleagues missed, and anyone who&apos;s ever wondered why the same pitcher dominates one lineup and gets shelled by another.
          </p>
          <p>
            We&apos;re information, not advice. We don&apos;t tell you who to bet on. We tell you what the data says — and you decide what it means.
          </p>
        </div>

        <div className="mt-16 pt-8 border-t border-stone-200 text-sm text-stone-500 font-mono">
          <p>Have a question, a story tip, or want to partner? <a href="mailto:hello@edgereportdaily.com" className="text-[#FF5722] hover:underline">hello@edgereportdaily.com</a></p>
        </div>
      </div>
    </main>
  )
}