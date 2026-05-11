/**
 * GA4 event tracking helper.
 * Events only fire if user has granted consent.
 */

type EventParams = Record<string, string | number | boolean | undefined>

export function trackEvent(eventName: string, params?: EventParams) {
  if (typeof window === 'undefined') return
  
  const gtag = (window as any).gtag
  if (!gtag) return
  
  gtag('event', eventName, params ?? {})
}

// Pre-defined events for type safety
export const EdgeEvents = {
  // Signup funnel
  signupStarted: (source: string) => 
    trackEvent('signup_started', { source }),
  
  signupSubmitted: (source: string) =>
    trackEvent('signup_submitted', { source }),
  
  signupVerified: () =>
    trackEvent('signup_verified'),
  
  preferencesTeamsSaved: (teamCount: number) =>
    trackEvent('preferences_teams_saved', { team_count: teamCount }),
  
  preferencesPrimarySaved: (team: string) =>
    trackEvent('preferences_primary_saved', { team }),
  
  // Engagement
  gamePreviewViewed: (matchup: string) =>
    trackEvent('game_preview_viewed', { matchup }),
  
  trackRecordViewed: () =>
    trackEvent('track_record_viewed'),
  
  dugoutViewed: () =>
    trackEvent('dugout_viewed'),
  
  // Pro funnel
  proFeatureLockedClick: (feature: string) =>
    trackEvent('pro_feature_locked_click', { feature }),
  
  proSignupStarted: () =>
    trackEvent('pro_signup_started'),
}