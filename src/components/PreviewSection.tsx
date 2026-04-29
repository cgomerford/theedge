import { ReactNode } from 'react'

type Props = {
  eyebrow: string
  title: string
  meta?: string
  children: ReactNode
  variant?: 'default' | 'highlight'
  id?: string
}

export default function PreviewSection({
  eyebrow,
  title,
  meta,
  children,
  variant = 'default',
  id,
}: Props) {
  const bg = variant === 'highlight' ? 'bg-white' : 'bg-stone-100/50'
  const border = variant === 'highlight' ? 'border-stone-300' : 'border-stone-200'

  return (
    <section
      id={id}
      className={`my-8 ${bg} border ${border} rounded-sm overflow-hidden`}
    >
      <header className="px-6 md:px-8 pt-6 pb-4 border-b border-stone-200/60 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-orange-600 mb-2">
            § {eyebrow}
          </div>
          <h2 className="text-2xl md:text-3xl font-serif font-light tracking-tight leading-tight text-stone-900">
            {title}
          </h2>
        </div>
        {meta && (
          <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">
            {meta}
          </div>
        )}
      </header>
      <div className="px-6 md:px-8 py-6">
        {children}
      </div>
    </section>
  )
}