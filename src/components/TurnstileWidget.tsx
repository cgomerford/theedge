'use client'

import Script from 'next/script'
import { useEffect, useRef } from 'react'

declare global {
 interface Window {
  turnstile?: {
    render: (selector: string | HTMLElement, options: object) => string
    getResponse: (widgetId?: string) => string | undefined
    reset: (widgetId?: string) => void
    remove: (widgetId?: string) => void
  }
    onTurnstileLoad?: () => void
  }
}

type Props = {
  /** Optional Tailwind classes to apply to the wrapper div */
  className?: string
  /** Theme: 'dark' matches the site's dark background, 'light' for light forms */
  theme?: 'light' | 'dark' | 'auto'
}

export default function TurnstileWidget({ className = 'my-3', theme = 'dark' }: Props) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    const tryRender = () => {
      if (!window.turnstile || !widgetRef.current || widgetIdRef.current) return

      const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      if (!siteKey) {
        console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY not set')
        return
      }

      widgetIdRef.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        theme,
        appearance: 'always',
      })
    }

    // Try immediately in case script is already loaded
    tryRender()

    // And set callback for when script loads
    window.onTurnstileLoad = tryRender

    return () => {
      // Clean up the widget on unmount
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }, [theme])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad"
        strategy="afterInteractive"
        async
        defer
      />
      <div ref={widgetRef} className={className} />
    </>
  )
}