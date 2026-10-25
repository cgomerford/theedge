'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export type TabItem = {
  id: string
  label: string
  badge?: string
  /** Route tab: renders a link instead of a button. Pair with `activeId`. */
  href?: string
}

// Underline tabs. Active tab = 3px bar in the site orange; inactive = muted text. No pills, no filled backgrounds.
//
//  - State tabs (default): the active tab lives in the URL as ?tab=id (canonical tags strip query strings).
//    Pass `urlSync={false}` for a secondary tab set inside a page, which keeps its state locally instead.
//  - Route tabs: give each item an `href` and pass `activeId`; the bar then just links between pages.
//  - Optional `panels` keyed by tab id; every panel stays mounted and inactive ones are hidden.
//
// On mobile the bar scrolls sideways. `sticky` should be true for ONE bar per page: it is the only sticky element.
export default function Tabs({
  tabs,
  defaultTab,
  panels,
  activeId,
  value,
  onChange,
  paramName = 'tab',
  urlSync = true,
  sticky = true,
  label,
}: {
  tabs: TabItem[]
  defaultTab?: string
  panels?: Record<string, React.ReactNode>
  activeId?: string
  /** Controlled mode: the parent owns the active tab (no URL sync). */
  value?: string
  onChange?: (id: string) => void
  paramName?: string
  urlSync?: boolean
  sticky?: boolean
  label?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const first = defaultTab ?? tabs[0]?.id
  const [local, setLocal] = useState(first)
  const fromUrl = params.get(paramName)
  const active =
    activeId ??
    value ??
    (urlSync ? (tabs.some(t => t.id === fromUrl) ? (fromUrl as string) : first) : local)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  const select = useCallback(
    (id: string) => {
      if (onChange) {
        onChange(id)
        return
      }
      if (!urlSync) {
        setLocal(id)
        return
      }
      const next = new URLSearchParams(params.toString())
      if (id === first) next.delete(paramName)
      else next.set(paramName, id)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [onChange, urlSync, params, first, paramName, pathname, router],
  )

  useEffect(() => {
    refs.current[active]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active])

  const onKey = (e: React.KeyboardEvent, i: number) => {
    let j = i
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = tabs.length - 1
    else return
    e.preventDefault()
    const target = tabs[j]
    if (target.href) router.push(target.href)
    else select(target.id)
    refs.current[target.id]?.focus()
  }

  return (
    <div>
      <style>{`
        .x9-tabs{display:flex;gap:22px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:#FAF8F3;border-bottom:1px solid #e7e2d8}
        .x9-tabs::-webkit-scrollbar{display:none}
        .x9-tabs.x9-sticky{position:sticky;top:0;z-index:20}
        .x9-tab{flex:0 0 auto;display:inline-block;appearance:none;background:none;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;padding:12px 2px 10px;font:inherit;font-size:14px;font-weight:700;color:#8a8275;cursor:pointer;white-space:nowrap;text-decoration:none}
        .x9-tab[aria-selected="true"]{color:#1A1A1A;border-bottom-color:#FF5722}
        .x9-tab:focus-visible{outline:2px solid #1A1A1A;outline-offset:-2px}
      `}</style>
      <div role="tablist" aria-label={label} className={`x9-tabs${sticky ? ' x9-sticky' : ''}`}>
        {tabs.map((t, i) => {
          const common = {
            role: 'tab' as const,
            id: `tab-${t.id}`,
            'aria-selected': active === t.id,
            tabIndex: active === t.id ? 0 : -1,
            className: 'x9-tab',
            onKeyDown: (e: React.KeyboardEvent) => onKey(e, i),
            ref: (el: HTMLElement | null) => {
              refs.current[t.id] = el
            },
          }
          const content = (
            <>
              {t.label}
              {t.badge ? <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 800, color: '#FF5722' }}>{t.badge}</span> : null}
            </>
          )
          return t.href ? (
            <Link key={t.id} href={t.href} {...common}>
              {content}
            </Link>
          ) : (
            <button key={t.id} type="button" aria-controls={`panel-${t.id}`} onClick={() => select(t.id)} {...common}>
              {content}
            </button>
          )
        })}
      </div>
      {panels &&
        tabs.map(t => (
          <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
            {panels[t.id]}
          </div>
        ))}
    </div>
  )
}
