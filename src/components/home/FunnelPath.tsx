import Link from 'next/link'

type Props = {
  gamesCount: number
  variant?: 'light' | 'dark'
}

export default function FunnelPath({ gamesCount, variant = 'light' }: Props) {
  const isDark = variant === 'dark'
  const stepClass = isDark
    ? 'border-stone-600 bg-stone-800/50'
    : 'border-stone-200 bg-white'
  const numClass = isDark ? 'text-[#fdba74]' : 'text-[#ea580c]'
  const titleClass = isDark ? 'text-stone-100' : 'text-stone-900'
  const descClass = isDark ? 'text-stone-400' : 'text-stone-500'

  const steps = [
    {
      n: '01',
      title: 'Browse tonight',
      desc:
        gamesCount > 0
          ? `${gamesCount} MLB games with Edge Scores on the live board.`
          : 'Live slate and game pages — no account required.',
      cta: gamesCount > 0 ? { href: '/tonight', label: 'Open live board' } : { href: '/mlb', label: 'MLB hub' },
    },
    {
      n: '02',
      title: 'Create free account',
      desc: 'Email signup. No card. Verify once and unlock your Dugout.',
      cta: { href: '#signup', label: 'Sign up free' },
    },
    {
      n: '03',
      title: 'Personal Dugout',
      desc: 'Follow teams, get pre-game briefs ~3 hours before first pitch.',
      cta: { href: '/how-it-works', label: 'See how it works' },
    },
  ]

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {steps.map((step, i) => (
        <div key={step.n} className={`relative p-5 border ${stepClass}`}>
          {i < steps.length - 1 && (
            <span
              className={`hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-lg ${isDark ? 'text-stone-600' : 'text-stone-300'}`}
              aria-hidden
            >
              →
            </span>
          )}
          <div className={`text-[10px] font-mono uppercase tracking-widest mb-2 ${numClass}`}>
            {step.n}
          </div>
          <h3 className={`font-serif font-bold text-lg mb-2 ${titleClass}`}>{step.title}</h3>
          <p className={`text-sm leading-relaxed mb-4 ${descClass}`}>{step.desc}</p>
          <Link
            href={step.cta.href}
            className={`text-[10px] font-mono uppercase tracking-widest hover:underline ${numClass}`}
          >
            {step.cta.label} →
          </Link>
        </div>
      ))}
    </div>
  )
}