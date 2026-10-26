// Wording shared by /signup and the pop-up. This is a free ACCOUNT, not an email list: email is one small line.
// Benefits are listed only for features that exist in the code (follows + /me, the daily deep look, the free Batting Lab tabs).
import { FREE_FOLLOW_LIMITS } from '@/lib/pricing'

export const SIGNUP_KICKER = 'FREE ACCOUNT'
export const SIGNUP_HEADLINE = 'Follow your players. Read them like a front office.'
export const SIGNUP_SUBHEAD = 'Free. No card.'
export const SIGNUP_BENEFITS = [
  `Follow up to ${FREE_FOLLOW_LIMITS.players} players and ${FREE_FOLLOW_LIMITS.teams} teams, all on your own page.`,
  'Full scout reports: the summary and the recap for every game.',
  "One full deep look a day: hot zones, a pitcher's arsenal or pitch shapes.",
  'Contact, Approach, Swing, Decisions, Outcomes and Platoon in Batting Lab.',
]
export const SIGNUP_NOTE = "Free. We'll email you when recaps start, and you can stop anytime."
export const SIGNUP_BUTTON = 'Create account'
export const SIGNUP_SENT = 'Check your email for your sign-in link.'
export const INLINE_ASK_LINE = 'Follow the players you care about and get one full deep look a day. Free.'
export const FOLLOW_LIMIT_MESSAGE = `You're following the most a free account can: ${FREE_FOLLOW_LIMITS.players} players and ${FREE_FOLLOW_LIMITS.teams} teams. Unfollow one to add another.`
