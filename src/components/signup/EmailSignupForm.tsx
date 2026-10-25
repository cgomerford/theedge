'use client'

import { useRef, useState } from 'react'
import TurnstileWidget from '@/components/TurnstileWidget'
import { SIGNUP_BUTTON, SIGNUP_NOTE } from './copy'

// Email-only signup. Posts to /api/auth/login (the existing magic-link route) and asks for JSON so the form can swap to
// "Check your inbox" in place. Without JavaScript the same form still works as a normal POST (the route redirects).
// The source (and utm_* / return_to when present) travels as hidden fields and is saved on the subscriber.

type Props = {
  source: string
  returnTo?: string
  extra?: Record<string, string | undefined>
  autoFocus?: boolean
  /** one row: field and button side by side, no note under it */
  compact?: boolean
  buttonLabel?: string
}

const ERRORS: Record<string, string> = {
  'rate-limit': 'Too many attempts. Try again in a minute.',
  invalid: 'Please enter a valid email.',
  'verify-failed': 'Browser check failed. Reload the page and try again.',
}

export default function EmailSignupForm({ source, returnTo, extra, autoFocus, compact, buttonLabel }: Props) {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    const email = String(data.get('email') ?? '').trim()
    setState('sending')
    setError(null)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        setSentTo(email)
        setState('sent')
      } else {
        setError(ERRORS[json.error ?? ''] ?? ERRORS.invalid)
        setState('idle')
        window.turnstile?.reset()
      }
    } catch {
      setError(ERRORS['verify-failed'])
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" aria-live="polite">
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A' }}>Check your inbox</div>
        <div style={{ marginTop: 6, fontSize: 16, color: '#1A1A1A', wordBreak: 'break-all' }}>{sentTo}</div>
      </div>
    )
  }

  return (
    <form ref={formRef} action="/api/auth/login" method="POST" onSubmit={onSubmit} style={compact ? { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' } : { display: 'grid', gap: 12 }}>
      <input type="hidden" name="from" value="signup" />
      <input type="hidden" name="source" value={source} />
      {returnTo && <input type="hidden" name="return_to" value={returnTo} />}
      {Object.entries(extra ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}

      <label htmlFor={`email-${source}`} style={compact ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } : { fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>Email</label>
      <input
        id={`email-${source}`}
        name="email"
        type="email"
        required
        autoComplete="email"
        autoFocus={autoFocus}
        style={{ width: compact ? undefined : '100%', flex: compact ? '1 1 220px' : undefined, minWidth: 0, boxSizing: 'border-box', padding: '12px 14px', background: '#fff', border: '1px solid #1A1A1A', borderRadius: 2, fontSize: 16, color: '#1A1A1A', outline: 'none' }}
      />

      <TurnstileWidget theme="light" />

      <button
        type="submit"
        disabled={state === 'sending'}
        style={{ padding: '14px 18px', background: '#1A1A1A', color: '#FAF8F3', border: 0, borderRadius: 2, fontSize: 16, fontWeight: 800, cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}
      >
        {buttonLabel ?? SIGNUP_BUTTON}
      </button>

      {error && <p role="alert" style={{ margin: 0, fontSize: 14, color: '#b42318' }}>{error}</p>}
      {!compact && <p style={{ margin: 0, fontSize: 13, color: '#8a8275' }}>{SIGNUP_NOTE}</p>}
    </form>
  )
}
