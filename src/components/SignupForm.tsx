'use client'

/**
 * src/components/SignupForm.tsx
 *
 * Client-side signup form with Turnstile CAPTCHA.
 * Intercepts submit, waits for the Turnstile token, then POSTs as JSON
 * so the token is always present in the request body.
 *
 * Replaces the raw <form method="POST"> on the homepage which was
 * submitting before Turnstile had a chance to inject the token.
 */

import { useState, useRef, useEffect } from 'react'
import Script from 'next/script'



type Status = 'idle' | 'loading' | 'success' | 'error' | 'rate-limit' | 'already-subscribed'

type Props = {
  source?: string
  buttonText?: string
  theme?: 'light' | 'dark' | 'auto'
}

export default function SignupForm({
  source = 'home_hero',
  buttonText = 'Get free access →',
  theme = 'light',
}: Props) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Render Turnstile widget once script loads
  const tryRender = () => {
    if (!window.turnstile || !widgetRef.current || widgetIdRef.current) return
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey) { console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY not set'); return }
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      theme,
      appearance: 'always',
    })
  }

  useEffect(() => {
    tryRender()
    window.onTurnstileLoad = tryRender
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch {}
      }
    }
  }, [theme])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

    // Get Turnstile token
    const token = widgetIdRef.current
      ? window.turnstile?.getResponse(widgetIdRef.current)
      : undefined

    if (!token) {
      setStatus('error')
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current)
      return
    }

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source,
          'cf-turnstile-response': token,
        }),
      })

      // API redirects on success/failure — check the final URL
      if (res.redirected) {
        const url = new URL(res.url)
        const checkEmail = url.searchParams.get('check-email')
        const alreadySub  = url.searchParams.get('already-subscribed')
        const error       = url.searchParams.get('error')

        if (checkEmail)  { setStatus('success'); return }
        if (alreadySub)  { setStatus('already-subscribed'); return }
        if (error === 'rate-limit') { setStatus('rate-limit'); return }
        setStatus('error')
      } else if (res.ok) {
        setStatus('success')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }

    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current)
  }

  if (status === 'success') {
    return (
      <div className="max-w-md">
        <div className="bg-white border border-stone-200 px-5 py-4 rounded-sm">
          <p className="font-mono text-[11px] uppercase tracking-widest text-stone-900 mb-1 font-bold">
            ✓ Check your inbox
          </p>
          <p className="font-mono text-[10px] text-stone-500">
            We&apos;ve sent a verification link to <span className="text-stone-900">{email}</span>.
            Click it to activate your account.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'already-subscribed') {
    return (
      <div className="max-w-md">
        <div className="bg-white border border-stone-200 px-5 py-4 rounded-sm">
          <p className="font-mono text-[11px] uppercase tracking-widest text-stone-900 mb-1 font-bold">
            Already subscribed
          </p>
          <p className="font-mono text-[10px] text-stone-500">
            {email} is already on the list. Check your inbox for the sign-in link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad"
        strategy="afterInteractive"
        async
        defer
      />

      <form onSubmit={handleSubmit} className="max-w-md mb-4">
        <div className="flex gap-2 flex-col sm:flex-row mb-3">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            disabled={status === 'loading'}
            className="flex-1 px-4 py-3.5 bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition shadow-sm rounded-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="px-6 py-3.5 bg-stone-900 text-white font-bold hover:bg-stone-800 transition font-mono text-[10px] uppercase tracking-widest whitespace-nowrap shadow-sm rounded-none disabled:opacity-50"
          >
            {status === 'loading' ? 'Sending...' : buttonText}
          </button>
        </div>

        {/* Turnstile widget */}
        <div ref={widgetRef} className="my-3" />

        {/* Error states */}
        {status === 'error' && (
          <p className="font-mono text-[10px] text-red-600 uppercase tracking-widest mt-2">
            Something went wrong — please try again.
          </p>
        )}
        {status === 'rate-limit' && (
          <p className="font-mono text-[10px] text-red-600 uppercase tracking-widest mt-2">
            Too many attempts — please wait a few minutes.
          </p>
        )}
      </form>
    </>
  )
}