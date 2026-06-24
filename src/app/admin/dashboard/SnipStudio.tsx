// src/app/admin/dashboard/SnipStudio.tsx
//
// Client component — renders copy-ready X drafts from server-built data.
// Receives only plain serialisable props (no service-role client here).
// Styling relies on the global .admin styles injected by page.tsx, plus its
// own scoped block below.
//
// REVISION NOTE (2026-06-24): initial build.

'use client'

import { useState } from 'react'
import type { SnipBundle } from '@/lib/admin-dashboard'

function CopyButton({ text, label = 'Copy post' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`snipbtn${copied ? ' copied' : ''}`}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }}
    >
      {copied ? 'Copied ⊕' : label}
    </button>
  )
}

function SnipCard({ snip }: { snip: { title: string; why: string; body: string; footnote: string } }) {
  return (
    <div className="snip">
      <div className="snip-head">
        <span className="t">{snip.title}</span>
        <span className="why">{snip.why}</span>
      </div>
      <div className="snip-body">
        <div className="draft">{snip.body}</div>
        <div className="snip-foot">
          <CopyButton text={snip.body} />
          <span className="note">{snip.footnote}</span>
        </div>
      </div>
    </div>
  )
}

export default function SnipStudio({ snips }: { snips: SnipBundle }) {
  return (
    <section className="sec">
      <style>{scoped}</style>
      <div className="sechead">
        <span className="glyph">§</span><h2>Snip studio</h2>
        <span className="tag">copy-ready for @edgereportdaily</span>
      </div>

      {snips.eotd && <SnipCard snip={snips.eotd} />}
      {snips.sotd && <SnipCard snip={snips.sotd} />}
      <SnipCard snip={snips.track} />

      {/* Reply ammo */}
      <div className="snip">
        <div className="snip-head">
          <span className="t">⊕ Reply ammo</span>
          <span className="why">replies ×13.5 — your real growth lever</span>
        </div>
        <div className="snip-body">
          {snips.ammo.length === 0 ? (
            <div className="note">No story leads on today&rsquo;s reads yet — generate narratives first.</div>
          ) : (
            snips.ammo.map((line, i) => (
              <div className="ammo" key={i}>
                <p>{line}</p>
                <CopyButton text={line} label="Copy" />
              </div>
            ))
          )}
          <div className="snip-foot" style={{ marginTop: 12 }}>
            <span className="note">
              <b>Pure value, no link.</b> Drop on mid-tier MLB/fantasy accounts (5K–100K) within 90 min of their post.
              Soft-sell lives in your bio + pinned, never the reply.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

const scoped = `
.admin .snip{border:1px solid #1A1A1A1a;background:#fff;margin-bottom:14px}
.admin .snip-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #1A1A1A1a;background:#1A1A1A;color:#FAF8F3}
.admin .snip-head .t{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:15px}
.admin .snip-head .why{margin-left:auto;font-size:10px;color:#d8d3c8;text-transform:uppercase;letter-spacing:.5px}
.admin .snip-body{padding:16px}
.admin .draft{white-space:pre-wrap;font-size:13px;line-height:1.65;border:1px dashed #1A1A1A1a;padding:14px;background:#FAF8F3}
.admin .snip-foot{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.admin .snipbtn{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;background:#FF5722;color:#fff;border:none;padding:9px 16px;cursor:pointer}
.admin .snipbtn:hover{background:#e64a19}
.admin .snipbtn.copied{background:#15803d}
.admin .note{font-size:10px;color:#6b6b66;line-height:1.5}
.admin .note b{color:#1A1A1A}
.admin .ammo{display:flex;align-items:flex-start;gap:10px;border:1px solid #1A1A1A1a;background:#fff;padding:10px 12px;margin-bottom:7px}
.admin .ammo p{font-size:13px;flex:1}
.admin .ammo .snipbtn{background:none;border:1px solid #1A1A1A;color:#1A1A1A;padding:5px 10px;white-space:nowrap}
.admin .ammo .snipbtn:hover{background:#1A1A1A;color:#FAF8F3}
.admin .ammo .snipbtn.copied{background:#15803d;border-color:#15803d;color:#fff}
`
