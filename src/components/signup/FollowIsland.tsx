'use client'

// A Follow button the page does not need a session for: the page stays static, and this island asks /api/me/follow-state who is looking.
// Until the answer arrives it shows the signed-out button, which opens the signup pop-up.
import { useEffect, useState } from 'react'
import FollowButton from './FollowButton'

export default function FollowIsland({ kind, refId, name }: { kind: 'player' | 'team'; refId: string; name: string }) {
  const [st, setSt] = useState<{ signedIn: boolean; following: boolean; atLimit: boolean }>({ signedIn: false, following: false, atLimit: false })
  useEffect(() => {
    let off = false
    fetch(`/api/me/follow-state?kind=${kind}&ref=${encodeURIComponent(refId)}`, { cache: 'no-store' })
      .then(r => r.json()).then(j => { if (!off && j.signedIn) setSt({ signedIn: true, following: !!j.following, atLimit: !!j.atLimit }) }).catch(() => {})
    return () => { off = true }
  }, [kind, refId])
  return <FollowButton key={`${st.signedIn}-${st.following}`} kind={kind} refId={refId} name={name} signedIn={st.signedIn} following={st.following} atLimit={st.atLimit} />
}
