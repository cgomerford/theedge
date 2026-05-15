type ProTakeaway = {
  stat: string
  text: string
  edge: 'home' | 'away' | 'neutral'
}

type Props = {
  takeaways: ProTakeaway[] | null
  homeAbbr: string
  awayAbbr: string
  isPro: boolean
}

export default function ProTakeaways({ takeaways, homeAbbr, awayAbbr, isPro }: Props) {
  if (!takeaways?.length) return null

  const edgeLabel = (edge: string) => {
    if (edge === 'home') return homeAbbr
    if (edge === 'away') return awayAbbr
    return 'EVEN'
  }

  const edgeColor = (edge: string) => {
    if (edge === 'neutral') return 'text-stone-500 bg-stone-100'
    return 'text-[#FF5722] bg-orange-50'
  }

  return (
    <section className="my-8">
      <div className="text-xs font-mono uppercase tracking-widest text-[#FF5722] mb-4">
        — Fantasy Matchup Intel
        <span className="ml-2 text-[9px] bg-[#1A1A1A] text-[#FDE047] px-1.5 py-0.5 rounded">
          PRO
        </span>
      </div>

      {!isPro ? (
        /* Locked state for free users */
        <div className="bg-[#F5F1E8] rounded-lg p-5 relative overflow-hidden">
          <div className="space-y-3 blur-[6px] select-none pointer-events-none">
            {takeaways.slice(0, 3).map((t, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                <span className="font-mono text-xs font-semibold text-[#FF5722] whitespace-nowrap">
                  {t.stat}
                </span>
                <span className="text-sm text-stone-700">{t.text}</span>
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-[#1A1A1A] text-[#FAF8F3] rounded px-5 py-3 text-center">
              <div className="text-[#FDE047] text-[10px] font-mono uppercase tracking-wider mb-1">
                ⊕ Pro Feature
              </div>
              <div className="text-sm font-serif font-bold">
                3 stat-matchup insights per game
              </div>
              <div className="text-[10px] text-stone-400 mt-1">
                Lineup-specific edges for your fantasy decisions
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Unlocked Pro state */
        <div className="bg-[#F5F1E8] rounded-lg p-5 space-y-0">
          {takeaways.map((t, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 py-3 ${
                i < takeaways.length - 1 ? 'border-b border-stone-300/50' : ''
              }`}
            >
              <div className="flex-shrink-0 flex flex-col items-end gap-1 min-w-[80px]">
                <span className="font-mono text-xs font-semibold text-[#FF5722]">
                  {t.stat}
                </span>
                <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${edgeColor(t.edge)}`}>
                  {edgeLabel(t.edge)}
                </span>
              </div>
              <span className="text-sm text-stone-800 leading-relaxed">{t.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}