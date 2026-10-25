// src/components/profile/ProPanel.tsx
//
// The Pro "expand" pattern shared by the team and player pages.
//
//   isPro  → a native <details> card (server-rendered, no client JS) that
//            expands in place to show the advanced view.
//   !isPro → nothing. Upgrade prompts live only in the page's one ProGate (src/components/pro/ProGate.tsx).
//
// `isPro` is a REQUIRED prop and never defaulted (CLAUDE.md gotcha: a default
// of true once leaked Pro content to logged-out users). Callers must also NOT
// fetch Pro-only data when !isPro — build the children only inside an
// `isPro ? … : null` branch (async children in <Suspense> are the usual way).

import Link from 'next/link'

const MONO = 'var(--font-redhat), sans-serif'
const SANS = 'var(--font-redhat), system-ui, sans-serif'
const DISPLAY = SANS

const CSS = `
.pp-sum{list-style:none;cursor:pointer}
.pp-sum::-webkit-details-marker{display:none}
.pp-det[open] .pp-chev{transform:rotate(180deg)}
.pp-chev{display:inline-block;transition:transform .15s}
`

// Plan names are not shown to anyone, so the PRO badge renders nothing (kept so existing imports compile).
export function ProBadge() {
  return null
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
  // Not Pro: nothing here. The page's single ProGate is the only place a visitor is asked to upgrade.
  if (!isPro) return null

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
