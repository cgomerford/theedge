'use client'

import { useState, useEffect } from 'react'

const CONSENT_KEY = 'edge_cookie_consent'

type ConsentState = 'pending' | 'accepted' | 'rejected'

export default function CookieConsent() {
  const [show, setShow] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check existing consent
    try {
      const stored = localStorage.getItem(CONSENT_KEY)
      if (!stored) {
        // No consent yet, show banner
        setShow(true)
      }
    } catch {
      // localStorage blocked, show banner to be safe
      setShow(true)
    }
  }, [])

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted')
      // Tell GA to update consent
      if (typeof window !== 'undefined' && (window as any).gtag) {
        ;(window as any).gtag('consent', 'update', {
          analytics_storage: 'granted',
        })
      }
    } catch {}
    setShow(false)
  }

  const handleReject = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'rejected')
      if (typeof window !== 'undefined' && (window as any).gtag) {
        ;(window as any).gtag('consent', 'update', {
          analytics_storage: 'denied',
        })
      }
    } catch {}
    setShow(false)
  }

  if (!mounted || !show) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-stone-900 text-stone-100 border-t-2 border-yellow-300 shadow-2xl">
      <div className="max-w-5xl mx-auto px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-2">
              ⊕ Cookies
            </div>
            <p className="text-sm font-serif leading-relaxed">
              We use analytics cookies to understand how visitors use The Edge. No advertising, no tracking pixels — just helping us build a better product.{' '}
              <a href="/privacy" className="underline hover:text-yellow-300">
                Learn more
              </a>
            </p>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-stone-600 hover:bg-stone-800 transition"
            >
              Reject
            </button>
            <button
              onClick={handleAccept}
              className="px-4 py-2 text-sm font-mono uppercase tracking-wider bg-yellow-300 text-stone-900 font-semibold hover:bg-yellow-200 transition"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}