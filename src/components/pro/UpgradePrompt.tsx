'use client'

import { useEffect, useState } from 'react'
import ProUnlockButton from './ProUnlockButton'
import CreateAccountButton from './CreateAccountButton'

// Upgrade prompt for client components that do not know who is looking (locked pitch types, search filters, notebooks).
// Signed out: "Create account", no price. Signed in: the unlock button, priced from what checkout would charge right now (see ProUnlockButton).
export default function UpgradePrompt({ source, line }: { source: string; line?: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    let off = false
    fetch('/api/auth/status').then(r => r.json()).then(j => { if (!off) setSignedIn(!!j.authenticated) }).catch(() => { if (!off) setSignedIn(false) })
    return () => { off = true }
  }, [])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '12px 0' }}>
      {line && <span style={{ fontSize: 14, fontWeight: 700 }}>{line}</span>}
      {signedIn ? <ProUnlockButton /> : <CreateAccountButton source={source} label="Create account" accent />}
    </div>
  )
}
