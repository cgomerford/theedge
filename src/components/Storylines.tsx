type StoryItem = {
  stat: string
  text: string
}

type Props = {
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  homeColor: string
  awayColor: string
  homeStories: StoryItem[] | null
  awayStories: StoryItem[] | null
}

export default function Storylines({
  homeTeam,
  awayTeam,
  homeAbbr,
  awayAbbr,
  homeColor,
  awayColor,
  homeStories,
  awayStories,
}: Props) {
  if (!homeStories?.length && !awayStories?.length) return null

  return (
    <section className="my-8">
      <div className="text-xs font-mono uppercase tracking-widest text-[#FF5722] mb-4">
        — Tonight&apos;s Storylines
      </div>
      <div className="bg-[#F5F1E8] rounded-lg p-5 space-y-5">
        {/* Home team stories */}
        {homeStories && homeStories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: homeColor }}
              />
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                {homeAbbr} · Home
              </span>
            </div>
            <div className="space-y-0">
              {homeStories.map((story, i) => (
                <div
                  key={i}
                  className={`py-2 text-sm text-stone-800 leading-relaxed ${
                    i < homeStories.length - 1
                      ? 'border-b border-stone-300/50'
                      : ''
                  }`}
                >
                  <span className="font-mono text-xs font-semibold text-[#FF5722] mr-1.5">
                    {story.stat}
                  </span>
                  — {story.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {homeStories?.length && awayStories?.length ? (
          <div className="h-px bg-stone-400/30" />
        ) : null}

        {/* Away team stories */}
        {awayStories && awayStories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: awayColor }}
              />
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
                {awayAbbr} · Away
              </span>
            </div>
            <div className="space-y-0">
              {awayStories.map((story, i) => (
                <div
                  key={i}
                  className={`py-2 text-sm text-stone-800 leading-relaxed ${
                    i < awayStories.length - 1
                      ? 'border-b border-stone-300/50'
                      : ''
                  }`}
                >
                  <span className="font-mono text-xs font-semibold text-[#FF5722] mr-1.5">
                    {story.stat}
                  </span>
                  — {story.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}