import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase'
import { findTeamByName } from '@/lib/teams'

export const runtime = 'edge'  // faster cold starts for image generation
export const revalidate = 0    // don't cache at the route level

type RouteParams = { params: Promise<{ gamePk: string }> }

// ============================================================
// Helpers
// ============================================================

function shortName(name: string): string {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

// ============================================================
// Route
// ============================================================

export async function GET(_req: Request, { params }: RouteParams) {
const { gamePk } = await params
  const gamePkNum = parseInt(gamePk, 10)
  
  if (isNaN(gamePkNum)) {
    return new Response(`Invalid gamePk: "${gamePk}". Must be a number.`, { status: 400 })
  }
  
  const supa = createAdminClient()

  // Fetch the prediction
  const { data: pred } = await supa
    .from('edge_predictions')
    .select('game_date, away_team, home_team, edge_score, confidence_tier, predicted_winner, actual_winner, was_correct, home_score, away_score')
    .eq('game_pk', gamePkNum)
    .single()

  if (!pred) {
    return new Response(`No prediction found for gamePk ${gamePkNum}`, { status: 404 })
  }

  // Derive display values
  const awayShort = shortName(pred.away_team)
  const homeShort = shortName(pred.home_team)
  const predictedTeamName = pred.predicted_winner === 'home' ? pred.home_team : pred.away_team
  const predictedShort = shortName(predictedTeamName)
  const edgeStr = (pred.edge_score > 0 ? '+' : '') + pred.edge_score
  
  const isGraded = pred.was_correct !== null
  const wasRight = pred.was_correct === true

  // Team colors for the predicted-team accent
  const predictedTeam = findTeamByName(predictedTeamName)
  const accentColor = predictedTeam?.primary_color ?? '#FF5722'

  // Format the date — "May 22, 2026"
  const dateObj = new Date(pred.game_date + 'T00:00:00Z')
  const dateStr = dateObj.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'UTC',
  })

  // Score text when graded
  const scoreText = pred.home_score !== null && pred.away_score !== null
    ? (pred.home_score > pred.away_score
        ? `${homeShort} ${pred.home_score}, ${awayShort} ${pred.away_score}`
        : `${awayShort} ${pred.away_score}, ${homeShort} ${pred.home_score}`)
    : null

  // Result banner color
  const resultColor = isGraded
    ? (wasRight ? '#15803d' : '#b91c1c')  // green-700 / red-700
    : '#78716c'                            // stone-500 for pending

  // ============================================================
  // The card
  // ============================================================
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#FAF8F3',
          color: '#1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 70px',
          fontFamily: 'Georgia, serif',
          position: 'relative',
        }}
      >
        {/* ═══ HEADER ROW ═══ */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderBottom: '2px solid #1a1a1a',
            paddingBottom: '20px',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '-1px' }}>
              The Edge
            </span>
            <span style={{ fontSize: '42px', fontWeight: 900, color: '#FF5722' }}>.</span>
          </div>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '18px',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: '#78716c',
            }}
          >
            {dateStr}
          </span>
        </div>

        {/* ═══ MATCHUP ═══ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            marginBottom: '40px',
          }}
        >
          <span style={{ fontSize: '88px', fontWeight: 300, letterSpacing: '-3px' }}>
            {awayShort}
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '32px',
              color: '#a8a29e',
              letterSpacing: '4px',
              textTransform: 'uppercase',
            }}
          >
            @
          </span>
          <span style={{ fontSize: '88px', fontWeight: 300, letterSpacing: '-3px' }}>
            {homeShort}
          </span>
        </div>

        {/* ═══ EDGE INDICATOR PANEL ═══ */}
        <div
          style={{
            background: '#1a1a1a',
            color: '#FAF8F3',
            display: 'flex',
            alignItems: 'center',
            padding: '32px 40px',
            gap: '40px',
            marginBottom: '32px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '14px',
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: '#dcfa3c',
                marginBottom: '6px',
              }}
            >
              ⊕ Edge
            </span>
            <span
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '76px',
                fontWeight: 900,
                color: '#dcfa3c',
                lineHeight: 1,
                letterSpacing: '-2px',
              }}
            >
              {edgeStr}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '14px',
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: '#a8a29e',
                marginBottom: '6px',
              }}
            >
              {tierLabel(pred.confidence_tier)} lean
            </span>
            <span
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '56px',
                fontWeight: 700,
                color: accentColor,
                lineHeight: 1,
                letterSpacing: '-1px',
              }}
            >
              {predictedShort}
            </span>
          </div>
        </div>

        {/* ═══ RESULT ROW ═══ */}
        {isGraded ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '24px 32px',
              border: `2px solid ${resultColor}`,
              background: wasRight ? '#f0fdf4' : '#fef2f2',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  color: resultColor,
                  marginBottom: '4px',
                }}
              >
                Final · {wasRight ? 'Model called it' : 'Model missed'}
              </span>
              <span style={{ fontSize: '40px', fontWeight: 700, color: '#1a1a1a' }}>
                {scoreText}
              </span>
            </div>
            <span
              style={{
                fontSize: '80px',
                fontWeight: 900,
                color: resultColor,
                lineHeight: 1,
              }}
            >
              {wasRight ? '✓' : '✗'}
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '24px 32px',
              border: '2px dashed #a8a29e',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '20px',
                letterSpacing: '3px',
                textTransform: 'uppercase',
                color: '#78716c',
              }}
            >
              Result pending
            </span>
          </div>
        )}

        {/* ═══ FOOTER ═══ */}
        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            left: '70px',
            right: '70px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'monospace',
            fontSize: '14px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#a8a29e',
          }}
        >
          <span>edgereportdaily.com</span>
          <span>Pre-game model · transparent track record</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Cache aggressively at the CDN layer — graded predictions never change
        'cache-control': isGraded
          ? 'public, max-age=31536000, immutable'  // 1 year for graded
          : 'public, max-age=300',                 // 5 min for pending
      },
    },
  )
}