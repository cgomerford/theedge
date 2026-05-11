type Props = {
  story_lead: string | null
}

export default function StoryLead({ story_lead }: Props) {
  if (!story_lead) return null
  
  return (
    <section className="my-12 md:my-16">
      <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mb-6">
        § The Story
      </div>
      <p className="text-2xl md:text-3xl font-serif italic font-light text-stone-900 leading-snug max-w-3xl">
        &ldquo;{story_lead}&rdquo;
      </p>
      <div className="text-xs font-mono uppercase tracking-wider text-stone-500 mt-6">
        — by The Edge
      </div>
    </section>
  )
}