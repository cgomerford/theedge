import { createAdminClient } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { teamLogoUrl } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import ShareCard from '@/components/ShareCard'

type Props = { searchParams: Promise<{ slug?: string }> }

export default async function SharePage({ searchParams }: Props) {
  const { slug } = await searchParams
  if (!slug) notFound()

  const supa = createAdminClient()

  const { data: pred, error } = await supa
    .from('edge_predictions')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !pred) notFound()

  const { data: preview } = await supa
    .from('game_previews')
    .select('home_team_id, away_team_id')
    .eq('slug', slug)
    .single()

  const homeColor = findTeamByName(pred.home_team)?.primary_color ?? null
  const awayColor = findTeamByName(pred.away_team)?.primary_color ?? null

  const gameTime = pred.game_time
    ? new Date(pred.game_time).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
      }) + ' ET'
    : 'TBD'

  return (
    <div style={{ width: 1200, height: 628, overflow: 'hidden', margin: 0, padding: 0 }}>
      <ShareCard
        homeTeam={pred.home_team}
        awayTeam={pred.away_team}
        homeAbbr={pred.home_team?.split(' ').pop()?.slice(0, 3).toUpperCase() ?? 'HOME'}
        awayAbbr={pred.away_team?.split(' ').pop()?.slice(0, 3).toUpperCase() ?? 'AWAY'}
        homeLogoUrl={preview?.home_team_id ? teamLogoUrl(preview.home_team_id) : ''}
        awayLogoUrl={preview?.away_team_id ? teamLogoUrl(preview.away_team_id) : ''}
        homePrimaryColor={homeColor}
        awayPrimaryColor={awayColor}
        gameTime={gameTime}
        edge_score={pred.edge_score}
        predicted_winner={pred.predicted_winner}
        confidence_tier={pred.confidence_tier}
        components={pred.components}
        summary={pred.summary}
        slug={slug}
      />
    </div>
  )
}
