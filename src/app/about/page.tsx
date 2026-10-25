export const metadata = pageMeta({
  title: 'About',
  description:
    'Why x9Lab exists, who builds it, and how public baseball data becomes plain-number game previews for fans who want more than a box score gives.',
  path: '/about',
})

import XMark from '@/components/XMark'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import { CONTACT_EMAIL } from '@/lib/site'
import { pageMeta } from '@/lib/seo'
import { BreadcrumbSchema } from '@/components/StructuredData'
import PendingBlock from '@/components/data/PendingBlock'

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F3] text-stone-900">
      <BreadcrumbSchema items={[{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]} />
      <SiteHeader variant="page" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] hover:underline">
          ← Back to home
        </Link>

        <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mt-8 mb-2"><XMark /> About</div>
        <h1 className="text-5xl md:text-6xl font-serif font-light tracking-tight mb-12">
          About x9Lab<span className="text-[#FF5722]">.</span>
        </h1>

        <div className="space-y-6 text-lg leading-relaxed text-stone-700 font-serif">
          <p>
            Sports media in 2026 is split into two camps. On one side, the data tools — other stat sites — built for experts, full of insight, but offering no story and no daily ritual.
          </p>
          <p>
            On the other side, mainstream sports media — the takes, the highlights, the box scores. Easy to consume, but rarely teaches you anything you didn&apos;t already know.
          </p>
          <p>
            x9Lab sits in the middle. We take the data the experts use, find the one or two stats that will actually matter in tonight&apos;s game, and tell you the story before first pitch. Five minutes. Free. Every day.
          </p>
          <p>
            We&apos;re built for fans who want to watch smarter, journalists who want angles their colleagues missed, and anyone who&apos;s ever wondered why the same pitcher dominates one lineup and gets shelled by another.
          </p>
          <p>
            We&apos;re information, not advice. We don&apos;t tell you who to bet on. We tell you what the data says — and you decide what it means.
          </p>
        </div>

        <div className="mt-12">
          <PendingBlock label="About bio [George: wording]" />
        </div>

        <div className="mt-16 pt-8 border-t border-stone-200 text-sm text-stone-500 font-mono">
          <p>Have a question, a story tip, or want to partner? <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#FF5722] hover:underline">{CONTACT_EMAIL}</a></p>
        </div>
      </div>
    </main>
  )
}