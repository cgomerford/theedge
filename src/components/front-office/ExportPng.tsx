'use client'

// Pro-only PNG export of the element with the given id (html-to-image). The
// parent only renders this button when isPro, so non-Pro HTML has no export code path.

import { useState } from 'react'
import { toPng } from 'html-to-image'

export default function ExportPng({ targetId, filename }: { targetId: string; filename: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  async function run() {
    const node = document.getElementById(targetId)
    if (!node) return
    setBusy(true); setErr(false)
    try {
      const url = await toPng(node, { pixelRatio: 2, backgroundColor: '#FAF8F3' })
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
    } catch (e) {
      console.error('[ExportPng]', e)
      setErr(true)
    } finally { setBusy(false) }
  }
  return (
    <button onClick={run} disabled={busy} style={{ fontFamily: 'var(--font-redhat), sans-serif', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: '#1A1A1A', color: '#FAF8F3', border: 0, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}>
      {busy ? 'Rendering…' : err ? 'Export failed — retry' : 'Export PNG'}
    </button>
  )
}
