import EmailSignupForm from '@/components/signup/EmailSignupForm'

// The homepage's one inline email ask (source "home_inline"): an orange-ruled row under the featured report.
export const HOME_EMAIL_TITLE = 'Get the free daily email'
export const HOME_EMAIL_LINE = 'One email before first pitch on game days: starters, projected lineups, bullpen pitch counts. Unsubscribe from any email.'

export default function HomeEmailAsk() {
  return (
    <div className="hm-ask" style={{ border: '2px solid #FF5722', borderRadius: 14, padding: '16px 20px', margin: '0 0 24px', background: '#fff' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{HOME_EMAIL_TITLE}</div>
        <div style={{ fontSize: 13, color: '#5b5347', marginTop: 2, lineHeight: 1.4 }}>{HOME_EMAIL_LINE}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <EmailSignupForm source="home_inline" compact buttonLabel="Send it" placeholder="you@email.com" />
      </div>
    </div>
  )
}
