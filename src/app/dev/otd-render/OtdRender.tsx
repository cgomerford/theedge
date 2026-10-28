'use client'

// Renders the chosen preset in a node of exactly the card size and exposes window.__otd for the render script:
//   renderPng()  the same export path the Download button uses (renderOtdPng), as a data URL
//   text()       the visible text of the card, for comparing against the preset data
import { useEffect, useRef } from 'react'
import { BLOCKS } from '@/components/graphics'
import { OTD_SIZES } from '@/lib/graphics/constants'
import { renderOtdPng, waitForCardFont, type OtdSize } from '@/lib/graphics/otd-export'
import { OTD_PRESETS } from '@/lib/graphics/otd-presets'

declare global { interface Window { __otd?: { ready: boolean; fontOk: boolean; renderPng: () => Promise<string>; text: () => string; images: () => number } } }

export default function OtdRender({ id, size }: { id: string; size: OtdSize }) {
  const ref = useRef<HTMLDivElement>(null)
  const spec = OTD_PRESETS.find(p => p.id === id)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const api = { ready: false, fontOk: false, renderPng: () => renderOtdPng(node, size), text: () => node.innerText, images: () => node.querySelectorAll('img').length }
    window.__otd = api
    void waitForCardFont(node).then(ok => { api.fontOk = ok; window.setTimeout(() => { api.ready = true }, 300) })
  }, [id, size])
  if (!spec) return <p style={{ padding: 40 }}>Unknown preset. Use one of: {OTD_PRESETS.map(p => p.id).join(', ')}</p>
  const Block = BLOCKS[spec.template]
  const { w, h } = OTD_SIZES[size]
  return <div style={{ background: '#d8d4c8', padding: 20 }}><div ref={ref} style={{ width: w, height: h }}><Block spec={spec} size={size} /></div></div>
}
