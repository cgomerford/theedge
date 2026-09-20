'use client'

// src/app/mlb/glossary/page.tsx
//
// One page explaining every stat this site actually surfaces on a chart —
// split into "Standard" (box-score) and "Statcast / Advanced" tiers, each
// entry with a plain-English definition, a "how much credence to take from
// it" line, and a small shared diagram (see StatDiagrams.tsx). Charts
// across the site link here via HelpLink (src/components/HelpLink.tsx)
// with a `?stat=<slug>` deep link that pre-selects the right category and
// scrolls straight to that entry, rather than dumping the reader at the
// top of a long list.
//
// Entirely static content, so this is a client component end to end (no
// server data fetch needed) — simplest way to get the category tabs,
// search box, and ?stat= deep-link handling working together.

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { StatVisual } from '@/components/glossary/StatDiagrams'
import { GLOSSARY_STATS, CATEGORY_LABEL, getStatBySlug, type StatCategory, type GlossaryStat } from '@/lib/stats-glossary'

function StatCard({ stat, isOpen, onToggle, registerRef }: {
  stat: GlossaryStat
  isOpen: boolean
  onToggle: () => void
  registerRef: (el: HTMLDivElement | null) => void
}) {
  return (
    <div
      ref={registerRef}
      id={`stat-${stat.slug}`}
      className={`rounded-xl border bg-white transition-colors ${isOpen ? 'border-[#1A1A1A]' : 'border-[#E8E4DC]'}`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 text-left p-4"
      >
        <div>
          <div className="text-[14px] font-bold text-[#1A1A1A]">{stat.name}</div>
          <div className="text-[11.5px] text-[#8A8577] mt-0.5">{stat.shortDef}</div>
        </div>
        <div className={`shrink-0 text-[#8A8577] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          <div className="grid sm:grid-cols-[1fr_260px] gap-4">
            <div>
              <p className="text-[12.5px] text-[#1A1A1A] leading-relaxed mb-3">{stat.detail}</p>
              <div className="rounded-lg bg-[#FAF8F3] border border-[#E8E4DC] p-3">
                <div className="text-[9px] uppercase tracking-wide font-bold text-[#FF5722] mb-1">How much to trust it</div>
                <p className="text-[11.5px] text-[#1A1A1A] leading-relaxed">{stat.trust}</p>
              </div>
              {stat.usedIn && stat.usedIn.length > 0 && (
                <div className="mt-3">
                  <div className="text-[9px] uppercase tracking-wide font-bold text-[#8A8577] mb-1">Where this shows up on The Edge</div>
                  <ul className="text-[11px] text-[#57534E] list-disc list-inside space-y-0.5">
                    {stat.usedIn.map(u => <li key={u}>{u}</li>)}
                  </ul>
                </div>
              )}
              {stat.seeAlso && stat.seeAlso.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {stat.seeAlso.map(slug => {
                    const related = getStatBySlug(slug)
                    if (!related) return null
                    return (
                      <a
                        key={slug}
                        href={`#stat-${slug}`}
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border border-[#DEDACE] text-[#8A8577] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition"
                      >
                        {related.name} →
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
            {stat.visual !== 'none' && (
              <div className="sm:pt-0">
                <StatVisual visual={stat.visual} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function GlossaryPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialCategory = (searchParams.get('category') as StatCategory | null)
  const initialStat = searchParams.get('stat')

  const [category, setCategory] = useState<StatCategory>(
    initialCategory === 'standard' || initialCategory === 'statcast'
      ? initialCategory
      : initialStat
        ? (getStatBySlug(initialStat)?.category ?? 'standard')
        : 'standard'
  )
  const [query, setQuery] = useState('')
  const [openSlug, setOpenSlug] = useState<string | null>(initialStat ?? null)

  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const didDeepLink = useRef(false)

  useEffect(() => {
    if (didDeepLink.current || !initialStat) return
    didDeepLink.current = true
    const el = cardRefs.current.get(initialStat)
    if (el) {
      // rAF so the card has actually rendered (open state + layout) before scrolling
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStat])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return GLOSSARY_STATS.filter(s => s.category === category && (q === '' || s.name.toLowerCase().includes(q) || s.shortDef.toLowerCase().includes(q)))
  }, [category, query])

  const switchCategory = (c: StatCategory) => {
    setCategory(c)
    setQuery('')
    router.replace(`/mlb/glossary?category=${c}`, { scroll: false })
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div>
          <div className="text-[26px] font-black text-[#1A1A1A] tracking-tight">Stats glossary</div>
          <div className="text-[13px] text-[#57534E] mt-1 max-w-[640px]">
            Every stat used somewhere on The Edge — what it measures, why it&apos;s worth trusting (or treating with
            caution), and a quick visual for how it&apos;s actually calculated. Standard stats are counted straight
            from the box score; Statcast/Advanced stats are tracked directly off pitch, swing, and ball-flight data,
            or modeled from it.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(['standard', 'statcast'] as StatCategory[]).map(c => (
              <button
                key={c}
                onClick={() => switchCategory(c)}
                className={`text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 rounded-full border transition ${category === c ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'text-[#8A8577] border-[#DEDACE] hover:border-[#1A1A1A] hover:text-[#1A1A1A]'}`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search stats…"
            className="text-[12px] px-3 py-2 rounded-full border border-[#DEDACE] bg-white text-[#1A1A1A] placeholder:text-[#B5B0A3] focus:outline-none focus:border-[#1A1A1A] sm:w-56"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          {filtered.length === 0 && (
            <div className="text-[12px] text-[#8A8577] italic py-6 text-center">No stats match &ldquo;{query}&rdquo; in this category.</div>
          )}
          {filtered.map(stat => (
            <StatCard
              key={stat.slug}
              stat={stat}
              isOpen={openSlug === stat.slug}
              onToggle={() => setOpenSlug(openSlug === stat.slug ? null : stat.slug)}
              registerRef={el => {
                if (el) cardRefs.current.set(stat.slug, el)
                else cardRefs.current.delete(stat.slug)
              }}
            />
          ))}
        </div>

        <div className="text-[11px] text-[#8A8577] border-t border-[#E8E4DC] pt-4">
          Missing a stat you&apos;d like explained? <Link href="/mlb" className="text-[#FF5722] font-bold hover:underline">Back to MLB home</Link>
        </div>
      </div>
    </main>
  )
}

export default function GlossaryPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#FAF8F3]" />}>
      <GlossaryPageInner />
    </Suspense>
  )
}
