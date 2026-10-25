import EmailSignupForm from '@/components/signup/EmailSignupForm'

// The homepage's one inline email ask: a single row between a top and bottom rule, no card around it.
export const HOME_EMAIL_LINE = '[George: home email line]'

export default function HomeEmailAsk() {
  return (
    <div style={{ borderTop: '1px solid #e7e2d8', borderBottom: '1px solid #e7e2d8', padding: '16px 0', margin: '24px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px' }}>
      <span style={{ fontSize: 16, fontWeight: 800, flex: '1 1 260px' }}>{HOME_EMAIL_LINE}</span>
      <div style={{ flex: '1 1 380px' }}>
        <EmailSignupForm source="home_inline" compact buttonLabel="Get the daily email" />
      </div>
    </div>
  )
}
