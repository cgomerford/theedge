'use client'

import { useState } from 'react'

type Props = {
  tweetText: string
  replyText: string
  imageUrl: string
}

export default function ShareButton({ tweetText, replyText, imageUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'tweet' | 'reply' | null>(null)

  async function copy(format: 'tweet' | 'reply') {
    const text = format === 'tweet' ? tweetText : replyText
    try {
      await navigator.clipboard.writeText(text)
      setCopied(format)
      setTimeout(() => {
        setCopied(null)
        setOpen(false)
      }, 1500)
    } catch (err) {
      console.error('Clipboard failed:', err)
      alert('Copy failed — your browser may not support clipboard API. Text:\n\n' + text)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-[10px] font-mono uppercase tracking-widest bg-stone-900 text-white px-3 py-1.5 hover:bg-stone-700 transition"
      >
        Share ▾
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
      <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-stone-200 shadow-lg min-w-[200px]">
            <button
              type="button"
              onClick={() => copy('tweet')}
              className="block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest hover:bg-stone-50 border-b border-stone-100"
            >
              {copied === 'tweet' ? '✓ Copied!' : 'Tweet format'}
              <div className="text-[10px] text-stone-400 normal-case tracking-normal font-sans mt-0.5">
                Short · with link
              </div>
            </button>
            <button
              type="button"
              onClick={() => copy('reply')}
              className="block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest hover:bg-stone-50 border-b border-stone-100"
            >
              {copied === 'reply' ? '✓ Copied!' : 'Reply format'}
              <div className="text-[10px] text-stone-400 normal-case tracking-normal font-sans mt-0.5">
                Longer · for Reddit/comments
              </div>
          </button>
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest hover:bg-stone-50 border-t border-stone-100"
              onClick={() => { setOpen(false) }}
            >
              📥 Download card
              <div className="text-[10px] text-stone-400 normal-case tracking-normal font-sans mt-0.5">
                1200×630 PNG · attach to post
              </div>
            </a>
          </div>
        </>
      )}
    </div>
  )
}