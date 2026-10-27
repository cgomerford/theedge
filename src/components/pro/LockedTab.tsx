import { ProGateRow } from '@/components/pro/ProGateView'

// Shown in place of a Pitching Lab / Batting Lab tab that needs an account. Server component; carries no data.
// Overview, Arsenal and Location Lab are open to everyone; the rest need a free account, which opens one full look a day per player.
export default function LockedTab({ name, lab = 'pitching' }: { name: string; lab?: 'batting' | 'pitching' }) {
  return (
    <section aria-label="Account needed" style={{ maxWidth: 720, margin: '24px auto' }}>
      <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Sign in to open this tab</h2>
      <p style={{ margin: '8px 0 0', fontSize: 15, color: '#5b5347', lineHeight: 1.55 }}>
        Overview, Arsenal and Location Lab are open to everyone. The rest of {name}&apos;s lab (shape, stuff, sequencing, the hot zone overlay, head to head and trends) needs a free account, which opens one full look a day on any player.
      </p>
      <ProGateRow tier="anon" source={`${lab}_lab`} who={{ lab, name }} />
    </section>
  )
}
