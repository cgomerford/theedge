import TurnstileWidget from '@/components/TurnstileWidget'

type Props = {
  source: string
  id?: string
  buttonLabel?: string
  layout?: 'inline' | 'stacked'
  className?: string
}

export default function SignupForm({
  source,
  id,
  buttonLabel = 'Get free access →',
  layout = 'inline',
  className = '',
}: Props) {
  const rowClass =
    layout === 'inline'
      ? 'flex gap-2 flex-col sm:flex-row mb-3'
      : 'flex flex-col gap-2 mb-3'

  return (
    <form id={id} action="/api/subscribe" method="POST" className={className}>
      <input type="hidden" name="source" value={source} />
      <div className={rowClass}>
        <input
          name="email"
          type="email"
          required
          placeholder="your@email.com"
          className="flex-1 px-4 py-3.5 bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition shadow-sm rounded-none"
        />
        <button
          type="submit"
          className="px-6 py-3.5 bg-stone-900 text-white font-bold hover:bg-stone-800 transition font-mono text-[10px] uppercase tracking-widest whitespace-nowrap shadow-sm rounded-none"
        >
          {buttonLabel}
        </button>
      </div>
      <TurnstileWidget />
    </form>
  )
}