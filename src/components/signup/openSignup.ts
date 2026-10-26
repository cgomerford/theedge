// Opens the pop-up signup form from anywhere on the client: openSignup('header'). The dialog itself is mounted
// once in the root layout (SignupModal) and listens for this event.
export const OPEN_SIGNUP_EVENT = 'x9-open-signup'

export function openSignup(source: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_SIGNUP_EVENT, { detail: { source } }))
}
