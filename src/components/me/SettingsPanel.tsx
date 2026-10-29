// src/components/me/SettingsPanel.tsx: the four settings items that used to sit at the bottom of /me, unchanged: Email address, Pick your teams, See plans or Manage subscription, Sign out.
import Link from 'next/link'
import ManageSubscriptionButton from '@/components/pro/ManageSubscriptionButton'
import { CARD, EYEBROW, GREY, C } from './ui'

const ROW: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', padding: '14px 0', borderTop: `1px solid ${C.line}`, fontSize: 15, color: '#1A1A1A' }

export default function SettingsPanel({ email, preferencesToken, isPro }: { email: string; preferencesToken: string | null; isPro: boolean }) {
  return (
    <section style={{ ...CARD, padding: '8px 20px 12px', maxWidth: 560 }} aria-labelledby="settings-h">
      <h2 id="settings-h" style={{ ...EYEBROW, margin: '14px 0 4px' }}>Settings</h2>
      <div style={{ ...ROW, justifyContent: 'space-between' }}><span style={{ color: GREY }}>Email address</span><b style={{ wordBreak: 'break-all' }}>{email}</b></div>
      {preferencesToken && <Link href={`/preferences/${preferencesToken}`} style={{ ...ROW, textDecoration: 'none' }}><b>Pick your teams</b></Link>}
      {isPro
        ? <ManageSubscriptionButton style={{ ...ROW, width: '100%', background: 'none', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer', color: '#1A1A1A' }} />
        : <Link href="/pricing" style={{ ...ROW, textDecoration: 'none' }}><b>See plans</b></Link>}
      <form action="/api/auth/logout" method="POST"><button type="submit" style={{ ...ROW, width: '100%', background: 'none', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 15, fontWeight: 800, cursor: 'pointer', color: '#1A1A1A' }}>Sign out</button></form>
    </section>
  )
}
