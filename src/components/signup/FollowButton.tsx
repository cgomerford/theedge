'use client'

import { useState } from 'react'
import { openSignup } from './openSignup'
import { FOLLOW_LIMIT_MESSAGE } from './copy'

type Props = {
  kind: 'player' | 'team'
  refId: string
  name: string
  signedIn: boolean
  following: boolean
  atLimit: boolean
}

// Signed out: opens the signup pop-up (source "follow"). Signed in: toggles the follow. At the limit, shows only the limit message.
export default function FollowButton({ kind, refId, name, signedIn, following: initial, atLimit: initialAtLimit }: Props) {
  const [following, setFollowing] = useState(initial)
  const [limited, setLimited] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    if (!signedIn) {
      openSignup('follow')
      return
    }
    if (!following && initialAtLimit) {
      setLimited(true)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ref: refId, name }),
      })
      const json = (await res.json()) as { ok: boolean; following?: boolean; error?: string }
      if (json.ok) {
        setFollowing(Boolean(json.following))
        setLimited(false)
      } else if (json.error === 'limit') {
        setLimited(true)
      }
    } catch {
      /* leave the button as it was */
    } finally {
      setBusy(false)
    }
  }

  if (limited) return <span style={{ fontSize: 14, fontWeight: 700 }}>{FOLLOW_LIMIT_MESSAGE}</span>

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={signedIn ? following : undefined}
      style={{ padding: '8px 16px', fontSize: 14, fontWeight: 800, borderRadius: 2, cursor: 'pointer', border: '1px solid currentColor', background: following ? 'currentColor' : 'transparent', color: 'inherit' }}
    >
      <span style={{ color: following ? 'var(--follow-on, #FAF8F3)' : 'inherit', mixBlendMode: 'normal' }}>{following ? 'Following' : 'Follow'}</span>
    </button>
  )
}
