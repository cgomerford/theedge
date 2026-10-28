'use client'

// The site's own x9 mark for the card header, with its white background made transparent so it sits cleanly on the cream paper.
// It is the same inlined PNG the other graphics use (no request, no external image); the canvas only turns near-white pixels clear.

import { useEffect, useState } from 'react'
import { X9_MARK_DATA_URL } from '@/components/graphics/XMarkInline'

export default function X9Mark({ height = 40 }: { height?: number }) {
  const [src, setSrc] = useState(X9_MARK_DATA_URL)
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const g = c.getContext('2d')
        if (!g) return
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, c.width, c.height)
        for (let i = 0; i < d.data.length; i += 4) {
          const m = Math.min(d.data[i], d.data[i + 1], d.data[i + 2])
          if (m >= 246) d.data[i + 3] = 0
          else if (m >= 215) d.data[i + 3] = Math.round(d.data[i + 3] * ((246 - m) / 31))
        }
        g.putImageData(d, 0, 0)
        setSrc(c.toDataURL('image/png'))
      } catch { /* keep the original mark */ }
    }
    img.src = X9_MARK_DATA_URL
  }, [])
  return <span aria-hidden data-x9-mark style={{ display: 'block', height, width: Math.round(height * 1.6), backgroundImage: `url(${src})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', flexShrink: 0 }} />
}
