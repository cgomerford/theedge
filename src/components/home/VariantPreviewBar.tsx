import Link from 'next/link'
import type { HomeVariant } from './types'

type Props = {
  current: HomeVariant
}

export default function VariantPreviewBar({ current }: Props) {
  if (process.env.NODE_ENV === 'production') return null

  const tabs: { id: HomeVariant; label: string }[] = [
    { id: 'proof', label: 'A · Proof-first' },
    { id: 'editorial', label: 'B · Editorial' },
  ]

  return (
    <div className="sticky top-0 z-[100] bg-stone-900 text-stone-100 border-b border-stone-700">
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest">
        <span className="text-stone-400">Home funnel preview</span>
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/?variant=${tab.id}`}
              className={`px-3 py-1 border transition ${
                current === tab.id
                  ? 'bg-[#ea580c] border-[#ea580c] text-white'
                  : 'border-stone-600 text-stone-300 hover:border-stone-400'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}