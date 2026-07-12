'use client'

import { useState, useRef, useEffect } from 'react'
import { toPng } from 'html-to-image'

export default function CardExportToolbar({
  targetRef, fileName,
}: {
  targetRef: React.RefObject<HTMLElement | null>
  fileName: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function capture(): Promise<string | null> {
    if (!targetRef.current) return null
    try {
      return await toPng(targetRef.current, { pixelRatio: 2, backgroundColor: '#FFFFFF' })
    } catch {
      return null
    }
  }

  async function handleDownload() {
    setBusy('download')
    const dataUrl = await capture()
    if (dataUrl) {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${fileName}.png`
      a.click()
    }
    setBusy(null)
    setOpen(false)
  }

  async function handleCopy() {
    setBusy('copy')
    const dataUrl = await capture()
    if (dataUrl && navigator.clipboard && 'write' in navigator.clipboard) {
      try {
        const blob = await (await fetch(dataUrl)).blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      } catch {
        // Clipboard image write isn't supported everywhere — Download is
        // always the reliable fallback, so a silent miss here is fine.
      }
    }
    setBusy(null)
    setOpen(false)
  }

  async function handleShare() {
    setBusy('share')
    const dataUrl = await capture()
    if (dataUrl && navigator.share) {
      try {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], `${fileName}.png`, { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName })
          setBusy(null)
          setOpen(false)
          return
        }
      } catch {
        // fall through to download
      }
    }
    await handleDownload()
  }

  function handleTweet() {
    handleDownload()
    const text = encodeURIComponent(`${fileName.replace(/-/g, ' ')} — via The Edge`)
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener')
    setOpen(false)
  }

  const itemClass = 'w-full text-left text-[10px] font-mono uppercase tracking-widest px-3 py-2 hover:bg-stone-50 disabled:opacity-40'

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={!!busy}
        className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-stone-300 hover:border-stone-900 disabled:opacity-40 transition flex items-center gap-1"
        aria-label="Export"
      >
        {busy ? '…' : '⇅ Export'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-stone-300 shadow-lg z-50">
          <button type="button" onClick={handleDownload} disabled={!!busy} className={itemClass}>Save PNG</button>
          <button type="button" onClick={handleCopy} disabled={!!busy} className={itemClass}>Copy image</button>
          <button type="button" onClick={handleShare} disabled={!!busy} className={itemClass}>Share</button>
          <button type="button" onClick={handleTweet} disabled={!!busy} className={itemClass}>Post to 𝕏</button>
        </div>
      )}
    </div>
  )
}