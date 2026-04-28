import { createAdminClient } from '@/lib/supabase'
import { MLB_TEAMS } from '@/lib/teams'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ saved?: string; welcome?: string }>
}

export const metadata = {
  title: "Pick your teams · The Edge",
  description: "Tell us which teams to follow. We'll only send briefs for games you care about.",
}

export default async function PreferencesPage({ params, searchParams }: Props) {
  const { token } = await params
  const sp = await searchParams
  const isWelcome = sp.welcome === '1'
  const isSaved = sp.saved === '1'

  const supa = createAdminClient()
  const { data: subscriber } = await supa
    .from('subscribers')
    .select('*')
    .eq('preferences_token', token)
    .single()

  if (!subscriber) notFound()

  const followedTeams: string[] = subscriber.teams ?? []

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">

        <a href="/" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to home
        </a>
{isWelcome && (
          <div className="mt-8 p-6 bg-stone-900 text-stone-100 border-l-4 border-yellow-300">
            <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-2">
              ✓ You&apos;re in
            </div>
            <p className="font-serif text-lg">
              Welcome to The Edge. Pick your teams below — we&apos;ll start sending briefs tomorrow morning.
            </p>
          </div>
        )}

        {isSaved && (
          <div className="mt-8 p-4 bg-green-50 border-l-4 border-green-700 text-green-900">
            <div className="text-xs font-mono uppercase tracking-widest text-green-700 mb-1">
              ✓ Saved
            </div>
            <p className="font-serif">Your preferences are updated. We&apos;ll only send briefs for the teams you&apos;ve picked.</p>
          </div>
        )}
        <div className="text-xs font-mono uppercase tracking-widest text-orange-600 mt-8 mb-4">
          — Your preferences
        </div>

        <h1 className="text-4xl md:text-6xl font-serif font-light tracking-tight mb-4">
          Pick your <em className="italic text-orange-600">teams.</em>
        </h1>

        <p className="text-lg text-stone-600 font-serif italic mb-8 max-w-2xl">
          We&apos;ll only send briefs for games featuring teams you follow. Pick as many as you like.
        </p>

        <p className="text-sm font-mono text-stone-500 mb-12">
          Subscribed as: <span className="text-stone-900 font-semibold">{subscriber.email}</span>
        </p>

        <form action="/api/preferences" method="POST" className="space-y-12">
          <input type="hidden" name="token" value={token} />

          {(['AL', 'NL'] as const).map(league => (
            <div key={league}>
              <h2 className="text-2xl font-serif font-semibold mb-6 pb-2 border-b border-stone-300">
                {league === 'AL' ? 'American League' : 'National League'}
              </h2>

              {(['East', 'Central', 'West'] as const).map(division => (
                <div key={division} className="mb-8">
                  <div className="text-xs font-mono uppercase tracking-widest text-stone-500 mb-3">
                    {league} {division}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {MLB_TEAMS
                      .filter(t => t.league === league && t.division === division)
                      .map(team => {
                        const isChecked = followedTeams.includes(team.slug)
                        return (
                          <label
                            key={team.slug}
                            className={`relative flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                              isChecked
                                ? 'border-orange-600 bg-orange-50'
                                : 'border-stone-200 bg-white hover:border-stone-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              name="teams"
                              value={team.slug}
                              defaultChecked={isChecked}
                              className="w-4 h-4 accent-orange-600"
                            />
                            <div>
                              <div className="font-mono text-xs text-stone-500">{team.abbrev}</div>
                              <div className="font-serif font-semibold text-sm">{team.short}</div>
                            </div>
                          </label>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="sticky bottom-4 bg-stone-900 text-stone-100 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-12">
            <div>
              <div className="text-xs font-mono uppercase tracking-widest text-yellow-300 mb-1">
                Don&apos;t forget to save
              </div>
              <div className="text-sm text-stone-400">Your preferences won&apos;t apply until you click save.</div>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-yellow-300 text-stone-900 font-semibold hover:bg-yellow-200 transition whitespace-nowrap"
            >
              Save preferences →
            </button>
          </div>
        </form>

        <div className="text-xs text-stone-500 leading-relaxed mt-16 pt-6 border-t border-stone-200">
          Don&apos;t see a sport you follow? NBA, NHL, NFL, and EPL are coming soon.
        </div>
      </div>
    </main>
  )
}