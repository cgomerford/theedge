'use client'

import { useEffect } from 'react'
import { EdgeEvents } from '@/lib/analytics'

type Event = 
  | 'signup_verified'
  | 'preferences_teams_saved'
  | 'preferences_primary_saved'
  | 'track_record_viewed'
  | 'dugout_viewed'

type Props = {
  event: Event
  data?: Record<string, string | number>
}

export default function AnalyticsTrigger({ event, data }: Props) {
  useEffect(() => {
    switch (event) {
      case 'signup_verified':
        EdgeEvents.signupVerified()
        break
      case 'preferences_teams_saved':
        EdgeEvents.preferencesTeamsSaved((data?.team_count as number) ?? 0)
        break
      case 'preferences_primary_saved':
        EdgeEvents.preferencesPrimarySaved((data?.team as string) ?? '')
        break
      case 'track_record_viewed':
        EdgeEvents.trackRecordViewed()
        break
      case 'dugout_viewed':
        EdgeEvents.dugoutViewed()
        break
    }
  }, [event, data])

  return null
}