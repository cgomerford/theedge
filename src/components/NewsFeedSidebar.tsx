// src/components/NewsFeedSidebar.tsx
//
// Compact "Around the league" list for the sidebar — presentational only,
// takes the SAME real news items page.tsx already fetches via
// getMLBNewsMultiSource(). No new data source; this just re-renders the
// existing real feed in the narrow sidebar card shape from mockup G,
// instead of the old full-width grid.
//
// Server component (no interactivity needed) — matches ArticlesTeaser
// sitting alongside it in the sidebar.

export type NewsSidebarItem = {
  id: string
  headline: string
  link: string
  published: string
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NewsFeedSidebar({ items }: { items: NewsSidebarItem[] }) {
  if (items.length === 0) return null

  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] font-bold text-[#8A8577] mb-3 mt-5">§ Around the league</div>
      {items.slice(0, 5).map((item, i) => (
        <a
          key={item.id}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex gap-2.5 py-3 ${i === 0 ? '' : 'border-t border-[#E8E4DC]'} group`}
        >
          <div className="w-[42px] h-[42px] shrink-0 bg-[#FAF8F3] border border-[#DEDACE] flex items-center justify-center">
            <span className="text-[7px] font-extrabold uppercase text-[#8A8577]">Wire</span>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-snug text-[#1A1A1A] group-hover:text-[#FF5722] transition-colors line-clamp-2">
              {item.headline}
            </div>
            <div className="text-[9.5px] uppercase tracking-wide text-[#8A8577] mt-1">{timeAgo(item.published)}</div>
          </div>
        </a>
      ))}
    </div>
  )
}
