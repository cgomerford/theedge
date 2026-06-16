'use client'

/**
 * src/components/SignupForm.tsx
 *
 * Fixes:
 * 1. Multiple instances on same page — uses a global registry instead of
 *    overwriting window.onTurnstileLoad
 * 2. Race condition — polls for window.turnstile if script already loaded
 * 3. Cleanup on unmount
 */

import { useState, useRef, useEffect } from 'react'
import Script from 'next/script'

// ─── Global Turnstile registry ────────────────────────────────────────────────
// Allows multiple SignupForm instances on the same page without overwriting
// each other's onTurnstileLoad callback.

declare global {
  interface Window {
    _turnstileCallbacks?: Set<() => void>
    onTurnstileLoad?: () => void
  }
}

function registerTurnstileCallback(cb: () => void) {
  if (!window._turnstileCallbacks) {
    window._turnstileCallbacks = new Set()
    // Wire the global callback once
    window.onTurnstileLoad = () => {
      window._turnstileCallbacks?.forEach(fn => fn())
    }
  }
  window._turnstileCallbacks.add(cb)
  return () => window._turnstileCallbacks?.delete(cb)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'loading' | 'success' | 'error' | 'rate-limit' | 'already-subscribed'

type Props = {
  source?: string
  buttonText?: string
  theme?: 'light' | 'dark' | 'auto'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignupForm({
  source = 'home_hero',
  buttonText = 'Get free access →',
  theme = 'light',
}: Props) {
  const [email, setEmail]     = useState('')
  const [status, setStatus]   = useState<Status>('idle')
  const [fanType, setFanType] = useState<'casual' | 'new'>('casual')
  const widgetRef   = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  const tryRender = () => {
    // Already rendered or container not mounted yet
    if (widgetIdRef.current || !widgetRef.current) return
    // Turnstile script not ready yet
    if (!window.turnstile) return

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey) {
      console.error('[SignupForm] NEXT_PUBLIC_TURNSTILE_SITE_KEY not set')
      return
    }

    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      theme,
      appearance: 'always',
    })

    // Widget rendered — stop polling
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    // 1. Try immediately — script may already be loaded
    tryRender()

    // 2. Register in global callback set for when script loads
    const unregister = registerTurnstileCallback(tryRender)

    // 3. Poll as fallback (handles edge cases where callback fires before
    //    React has mounted the div)
    pollRef.current = setInterval(tryRender, 200)

    // Stop polling after 10 seconds regardless
    const timeout = setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }, 10_000)

    return () => {
      unregister()
      if (pollRef.current) clearInterval(pollRef.current)
      clearTimeout(timeout)
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch {}
        widgetIdRef.current = null
      }
    }
  }, [theme])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')

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
          fan_type: fanType,
          'cf-turnstile-response': token,
        }),
      })

      if (res.redirected) {
        const url = new URL(res.url)
        if (url.searchParams.get('check-email'))        { setStatus('success');            return }
        if (url.searchParams.get('already-subscribed')) { setStatus('already-subscribed'); return }
        if (url.searchParams.get('error') === 'rate-limit') { setStatus('rate-limit');     return }
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

  // ── Success / already-subscribed states ───────────────────────────────────

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

  // ── Form ──────────────────────────────────────────────────────────────────

return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit"
        strategy="afterInteractive"
      />

      <form onSubmit={handleSubmit} className="max-w-md mb-4">
        <div className="flex gap-2 flex-col sm:flex-row mb-4">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            disabled={status === 'loading'}
            className="flex-1 px-4 py-3.5 bg-white border border-stone-300 text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-900 focus:ring-1 focus:ring-stone-900 transition shadow-sm rounded-none disabled:opacity-50"
          />
        </div>

        {/* ── Fan type selector ── */}
        <div className="mb-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-stone-400 mb-2">
            How should we explain things?
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'casual', label: 'I know the game', desc: 'Sharp reads, key stats, no hand-holding.' },
              { value: 'new',    label: 'New to baseball',  desc: "We'll explain the nuances as we go." },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFanType(opt.value)}
                className={[
                  'text-left border p-3 transition',
                  fanType === opt.value
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-300 bg-white text-stone-900 hover:border-stone-500',
                ].join(' ')}
              >
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest mb-1">
                  {opt.label}
                </div>
                <div className={`font-serif italic text-[11px] leading-snug ${fanType === opt.value ? 'text-stone-300' : 'text-stone-500'}`}>
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full px-6 py-3.5 bg-[#FF5722] text-white font-bold hover:bg-orange-600 transition font-mono text-[10px] uppercase tracking-widest shadow-sm rounded-none disabled:opacity-50 mb-3"
        >
          {status === 'loading' ? 'Sending...' : buttonText}
        </button>

        {/* Turnstile mounts here */}
        <div ref={widgetRef} className="my-3" />

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