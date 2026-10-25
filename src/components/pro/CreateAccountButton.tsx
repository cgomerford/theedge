'use client'

import { openSignup } from '@/components/signup/openSignup'

// Signed-out version of the gate button: opens the signup form with the page's source. No price anywhere near it.
export default function CreateAccountButton({ source }: { source: string }) {
  return (
    <button
      type="button"
      onClick={() => openSignup(source)}
      style={{ padding: '12px 18px', background: '#1A1A1A', color: '#FAF8F3', border: 0, borderRadius: 2, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
    >
      Create a free account
    </button>
  )
}
