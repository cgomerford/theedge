type Props = {
  text: string | null
}

export default function Contrarian({ text }: Props) {
  if (!text) return null

  return (
    <section className="my-8">
      <div className="border border-stone-300 border-l-[3px] border-l-[#FF5722] rounded-r-lg p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">
          ⚠ Why we might be wrong
        </div>
        <p className="text-sm text-stone-800 leading-relaxed font-serif">
          {text}
        </p>
      </div>
    </section>
  )
}