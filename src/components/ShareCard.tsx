'use client'

/**
 * src/components/ShareCard.tsx
 *
 * A fixed 1200×628 card (Twitter/X optimal ratio) showing:
 *   - Teams + matchup
 *   - Factor count headline ("6 of 8 factors lean PHI")
 *   - Confidence tier pill
 *   - 8 factor bars
 *   - One-line summary
 *   - The Edge branding
 *
 * Usage: render at /mlb/[slug]/share
 * Screenshot with browser devtools at exactly 1200×628 and schedule via Buffer/Hypefury.
 *
 * Pass all props from your edge_predictions row.
 */

type FactorKey = 'starting_pitcher' | 'bullpen' | 'offense' | 'defense' | 'matchup' | 'park' | 'weather' | 'rest'

type ShareCardProps = {
  homeTeam: string
  awayTeam: string
  homeAbbr: string
  awayAbbr: string
  homeLogoUrl: string
  awayLogoUrl: string
  homePrimaryColor?: string | null
  awayPrimaryColor?: string | null
  gameTime: string
  venue?: string
  edge_score: number
  predicted_winner: 'home' | 'away'
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  components: Record<FactorKey, number>
  summary?: string | null
  slug: string
}

const FACTOR_LABELS: Record<FactorKey, string> = {
  starting_pitcher: 'Starting Pitcher',
  bullpen:          'Bullpen',
  offense:          'Offense',
  defense:          'Defense',
  matchup:          'Pitch Matchup',
  park:             'Park Factor',
  weather:          'Weather',
  rest:             'Rest & Travel',
}

const FACTOR_ORDER: FactorKey[] = [
  'starting_pitcher', 'bullpen', 'offense', 'defense',
  'matchup', 'park', 'weather', 'rest',
]

function tierLabel(t: string): string {
  return { strong: 'Strong lean', moderate: 'Moderate lean', slight: 'Slight lean', tossup: 'Toss-up' }[t] ?? t
}
function tierColor(t: string): string {
  return { strong: '#27500A', moderate: '#7C3800', slight: '#0C447C', tossup: '#5F5E5A' }[t] ?? '#5F5E5A'
}
function tierBg(t: string): string {
  return { strong: '#EAF3DE', moderate: '#FAEEDA', slight: '#E6F1FB', tossup: '#F1EFE8' }[t] ?? '#F1EFE8'
}

export default function ShareCard({
  homeTeam, awayTeam, homeAbbr, awayAbbr,
  homeLogoUrl, awayLogoUrl,
  homePrimaryColor, awayPrimaryColor,
  gameTime, venue,
  edge_score, predicted_winner, confidence_tier,
  components, summary, slug,
}: ShareCardProps) {

  const winnerAbbr   = predicted_winner === 'home' ? homeAbbr : awayAbbr
  const winnerColor  = predicted_winner === 'home'
    ? (homePrimaryColor ?? '#FF5722')
    : (awayPrimaryColor ?? '#FF5722')
  const loserColor   = predicted_winner === 'home'
    ? (awayPrimaryColor ?? '#A3A3A3')
    : (homePrimaryColor ?? '#A3A3A3')

  // Factor count — any factor > 0 counts for home, < 0 for away
  const total      = FACTOR_ORDER.length
  const winnerCount = FACTOR_ORDER.filter(k =>
    predicted_winner === 'home' ? components[k] > 0 : components[k] < 0
  ).length

  return (
    <div style={{
      width: 1200,
      height: 628,
      background: '#1A1A1A',
      fontFamily: "'JetBrains Mono', monospace",
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Background texture — subtle diagonal lines */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 12px)',
        pointerEvents: 'none',
      }} />

      {/* Winner colour accent — left edge bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 6, background: winnerColor,
      }} />

      {/* TOP STRIP — branding */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px 16px 46px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: '#FF5722',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          THE EDGE · edgereportdaily.com
        </div>
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.06em',
        }}>
          {gameTime}{venue ? ` · ${venue}` : ''}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{
        display: 'flex', flex: 1, padding: '0 40px 0 46px', gap: 48,
        alignItems: 'stretch',
      }}>

        {/* LEFT — matchup + headline */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 20,
          width: 420, flexShrink: 0,
        }}>

          {/* Teams */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <img src={awayLogoUrl} alt={awayAbbr} width={72} height={72} style={{ objectFit: 'contain' }} />
              <span style={{
                fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.06em',
              }}>
                {awayAbbr}
              </span>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              flex: 1,
            }}>
              <span style={{
                fontSize: 13, color: 'rgba(255,255,255,0.25)',
                letterSpacing: '0.1em',
              }}>
                AT
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <img src={homeLogoUrl} alt={homeAbbr} width={72} height={72} style={{ objectFit: 'contain' }} />
              <span style={{
                fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.06em',
              }}>
                {homeAbbr}
              </span>
            </div>
          </div>

          {/* Factor count headline */}
          <div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 62, lineHeight: 1, color: '#FAF8F3',
              letterSpacing: '0.02em',
            }}>
              {winnerCount} of {total}
            </div>
            <div style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 22, color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.2, marginTop: 4,
            }}>
              data factors lean{' '}
              <span style={{ color: winnerColor, fontWeight: 700 }}>
                {winnerAbbr}
              </span>
            </div>
          </div>

          {/* Tier pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: tierColor(confidence_tier),
              background: tierBg(confidence_tier),
              padding: '4px 12px', borderRadius: 3,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {tierLabel(confidence_tier)}
            </span>
          </div>

          {/* Summary */}
          {summary && (
            <p style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 14, color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.5, margin: 0,
              fontStyle: 'italic',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 16,
            }}>
              {summary.length > 120 ? summary.slice(0, 117) + '…' : summary}
            </p>
          )}
        </div>

        {/* DIVIDER */}
        <div style={{
          width: 1, background: 'rgba(255,255,255,0.08)',
          alignSelf: 'stretch', margin: '24px 0',
          flexShrink: 0,
        }} />

        {/* RIGHT — factor bars */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', gap: 10,
          paddingTop: 24, paddingBottom: 24,
        }}>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '140px 1fr',
            gap: 12, marginBottom: 4,
          }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Factor</span>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: awayPrimaryColor ?? '#A3A3A3', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{awayAbbr}</span>
              <span style={{ fontSize: 10, color: homePrimaryColor ?? '#A3A3A3', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{homeAbbr}</span>
            </div>
          </div>

          {FACTOR_ORDER.map(key => {
            const score   = components[key] ?? 0
            const isHome  = score > 0
            const isAway  = score < 0
            const abs     = Math.abs(score)
            // Bar width: 0–100 scale clamped to 50% max from centre
            const barPct  = Math.min(abs / 100, 1) * 50
            const barColor = isHome
              ? (homePrimaryColor ?? '#FF5722')
              : isAway
              ? (awayPrimaryColor ?? '#6B7280')
              : 'rgba(255,255,255,0.15)'

            return (
              <div key={key} style={{
                display: 'grid', gridTemplateColumns: '140px 1fr',
                gap: 12, alignItems: 'center',
              }}>
                {/* Label */}
                <span style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.45)',
                  letterSpacing: '0.03em', whiteSpace: 'nowrap',
                }}>
                  {FACTOR_LABELS[key]}
                </span>

                {/* Bar track */}
                <div style={{
                  position: 'relative', height: 10,
                  background: 'rgba(255,255,255,0.07)',
                  borderRadius: 0,
                }}>
                  {/* Neutral centre tick */}
                  <div style={{
                    position: 'absolute', left: '50%', top: 0, bottom: 0,
                    width: 1, background: 'rgba(255,255,255,0.15)',
                    transform: 'translateX(-50%)',
                  }} />

                  {/* Filled bar */}
                  {abs > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: 0, bottom: 0,
                      width: `${barPct}%`,
                      background: barColor,
                      ...(isHome
                        ? { left: '50%' }
                        : { right: '50%' }
                      ),
                    }} />
                  )}

                  {/* Lean dot */}
                  {abs > 0 && (
                    <div style={{
                      position: 'absolute', top: '50%',
                      width: 8, height: 8, borderRadius: '50%',
                      background: barColor,
                      transform: 'translateY(-50%)',
                      ...(isHome
                        ? { left: `calc(50% + ${barPct}% - 4px)` }
                        : { right: `calc(50% + ${barPct}% - 4px)` }
                      ),
                    }} />
                  )}
                </div>
              </div>
            )
          })}

          {/* URL footer */}
          <div style={{
            marginTop: 12,
            fontSize: 11, color: 'rgba(255,255,255,0.2)',
            letterSpacing: '0.06em',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 10,
          }}>
            edgereportdaily.com/mlb/{slug}
          </div>
        </div>
      </div>
    </div>
  )
}