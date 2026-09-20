// src/components/profile/ProPanel.tsx
//
// The Pro "expand" pattern shared by the team and player pages.
//
//   isPro  → a native <details> card (server-rendered, no client JS) that
//            expands in place to show the advanced view.
//   !isPro → a locked card: what is inside, and an upgrade link. It shows NO
//            numbers and no blurred fake chart — empty state over fabricated
//            data (CLAUDE.md) — just a plain-language list of what unlocks.
//
// `isPro` is a REQUIRED prop and never defaulted (CLAUDE.md gotcha: a default
// of true once leaked Pro content to logged-out users). Callers must also NOT
// fetch Pro-only data when !isPro — build the children only inside an
// `isPro ? … : null` branch (async children in <Suspense> are the usual way).

import Link from 'next/link'

const MONO = 'var(--font-jetbrains), ui-monospace, monospace'
const SANS = 'var(--font-outfit), system-ui, sans-serif'
const DISPLAY = SANS

const CSS = `
.pp-sum{list-style:none;cursor:pointer}
.pp-sum::-webkit-details-marker{display:none}
.pp-det[open] .pp-chev{transform:rotate(180deg)}
.pp-chev{display:inline-block;transition:transform .15s}
`

export function ProBadge() {
  return <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', background: '#FDE047', color: '#1A1A1A', padding: '3px 7px', borderRadius: 5 }}>PRO</span>
}

export default function ProPanel({
  title, blurb, features, isPro, defaultOpen = false, upgradeHref = '/pricing', labHref, labLabel, showLabLinkWhenOpen = true, children,
}: {
  title: string
  blurb: string
  features: string[]
  isPro: boolean
  defaultOpen?: boolean
  upgradeHref?: string
  /** optional deep link to the lab for people who want to go further than this panel */
  labHref?: string
  labLabel?: string
  /** the open (Pro) card repeats the lab link at the bottom; turn off when the children already contain it */
  showLabLinkWhenOpen?: boolean
  children?: React.ReactNode
}) {
  if (!isPro) {
    return (
      <div style={{ border: '1.5px dashed #d8d2c4', borderRadius: 14, padding: 20, background: 'rgba(255,255,255,.55)' }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <ProBadge />
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: '#1A1A1A', letterSpacing: '.02em' }}>{title}</span>
        </div>
        <p style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', margin: '8px 0 12px', lineHeight: 1.5, maxWidth: 680 }}>{blurb}</p>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '6px 20px' }}>
          {features.map(f => (
            <li key={f} style={{ fontFamily: SANS, fontSize: 12.5, color: '#3a352c', display: 'flex', gap: 8, lineHeight: 1.4 }}>
              <span style={{ color: '#FF5722', flexShrink: 0 }}>◆</span>{f}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <Link href={upgradeHref} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: '#1A1A1A', color: '#FAF8F3', padding: '9px 14px', borderRadius: 8, textDecoration: 'none' }}>Unlock with Pro →</Link>
          {labHref && <Link href={labHref} style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>{labLabel ?? 'Open the lab'} →</Link>}
        </div>
      </div>
    )
  }

  return (
    <details className="pp-det" open={defaultOpen} style={{ border: '1px solid #e7e2d8', borderRadius: 14, background: '#fff' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <summary className="pp-sum" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ProBadge />
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: '#1A1A1A', letterSpacing: '.02em' }}>{title}</span>
        <span style={{ fontFamily: SANS, fontSize: 12.5, color: '#8a8275', flex: 1, minWidth: 200 }}>{blurb}</span>
        <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#FF5722', fontWeight: 700 }}>Expand <span className="pp-chev">▾</span></span>
      </summary>
      <div style={{ padding: '4px 20px 20px', borderTop: '1px solid #f1eee6' }}>
        <div style={{ paddingTop: 16 }}>{children}</div>
        {labHref && showLabLinkWhenOpen && (
          <div style={{ marginTop: 14 }}>
            <Link href={labHref} style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#FF5722', textDecoration: 'none', fontWeight: 700 }}>{labLabel ?? 'Open the lab'} →</Link>
          </div>
        )}
      </div>
    </details>
  )
}
