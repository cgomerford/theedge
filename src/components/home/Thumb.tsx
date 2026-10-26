'use client'

import { useState } from 'react'

// Square thumbnail for the homepage rail. No image, or an image that fails to load, shows a plain newspaper icon so a
// row never looks broken.
export default function Thumb({ src, size = 56 }: { src?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const box: React.CSSProperties = { width: size, height: size, flexShrink: 0, borderRadius: 2, background: '#f1eee6', border: '1px solid #e7e2d8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
  if (!src || failed) {
    return (
      <span aria-hidden="true" style={box}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#8a8275" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h13a1 1 0 0 1 1 1v13H6a2 2 0 0 1-2-2V5z" />
          <path d="M18 9h2v8a2 2 0 0 1-2 2" />
          <path d="M8 9h6M8 13h6M8 16h4" />
        </svg>
      </span>
    )
  }
  return (
    <span style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </span>
  )
}
