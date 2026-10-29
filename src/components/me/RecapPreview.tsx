// src/components/me/RecapPreview.tsx: what a "Your follows this week" recap would say, built from the real season numbers already loaded. Status is "pending" until recaps run.
import { CARD, EYEBROW, GREY, NUMS, C } from './ui'

export default function RecapPreview({ line, season }: { line: string | null; season: number }) {
  return (
    <section style={{ ...CARD, padding: 16 }} aria-label="Recap email preview">
      <h2 style={{ ...EYEBROW, color: '#1A1A1A', margin: 0 }}>Recap email preview</h2>
      <div style={{ marginTop: 8, fontSize: 13, color: GREY }}>Subject: Your follows this week</div>
      <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, ...NUMS }}>{line ? `${line} in ${season}` : 'Follow a player to see their numbers here.'}</div>
      <div style={{ marginTop: 8, fontSize: 12.5, color: GREY }}>We&apos;ll email you when recaps start.</div>
      <div style={{ marginTop: 4, fontSize: 12.5, color: GREY }}>Status: pending · <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: C.orange, border: `1px solid ${C.orange}`, borderRadius: 4, padding: '1px 5px' }}>PRO</span> My Team Weekly</div>
    </section>
  )
}
