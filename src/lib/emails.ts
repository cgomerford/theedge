export function welcomeEmail(email: string, preferencesToken: string) {
  const preferencesUrl = `https://edgereportdaily.com/preferences/${preferencesToken}`
  const unsubscribeUrl = `https://edgereportdaily.com/api/unsubscribe?email=${encodeURIComponent(email)}`

  return {
    subject: "Welcome to The Edge — pick your teams.",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to The Edge</title>
</head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;max-width:600px;width:100%;">

          <tr>
            <td style="padding:32px 40px 24px;border-bottom:2px solid #1a1a1a;">
              <div style="font-size:11px;letter-spacing:2px;color:#666;text-transform:uppercase;margin-bottom:16px;font-family:'Courier New',monospace;">
                The Edge Daily · Welcome
              </div>
              <div style="font-family:Georgia,serif;font-size:36px;font-weight:900;letter-spacing:-1px;color:#1a1a1a;line-height:1;">
                The Edge<span style="color:#ff5722;">.</span>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 40px 24px;">
              <div style="font-size:11px;letter-spacing:2px;color:#ff5722;text-transform:uppercase;margin-bottom:16px;font-family:'Courier New',monospace;">
                — You're in
              </div>
              <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.15;color:#1a1a1a;margin:0 0 20px 0;font-weight:600;letter-spacing:-1px;">
                Welcome to <em style="color:#ff5722;">The Edge.</em>
              </h1>
              <p style="font-family:Georgia,serif;font-size:17px;line-height:1.55;color:#333;margin:0 0 16px 0;">
                One quick thing before tomorrow morning&apos;s brief.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 40px 8px;">
              <div style="background:#1a1a1a;color:#f4f1ea;padding:24px;text-align:center;">
                <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;color:#dcfa3c;text-transform:uppercase;margin-bottom:12px;">
                  → Step 1
                </div>
                <h2 style="font-family:Georgia,serif;font-size:24px;line-height:1.1;margin:0 0 12px 0;color:#fff;font-weight:600;">
                  Tell us your teams.
                </h2>
                <p style="font-family:Georgia,serif;font-size:15px;line-height:1.5;color:#ccc;margin:0 0 20px 0;">
                  We&apos;ll only send briefs for games featuring teams you actually care about. Takes 30 seconds.
                </p>
                <a href="${preferencesUrl}" style="display:inline-block;background:#dcfa3c;color:#1a1a1a;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:14px;padding:14px 28px;text-decoration:none;letter-spacing:0.5px;">
                  Pick your teams →
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 0;">
              <p style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#333;margin:0 0 16px 0;">
                <strong>The brief lands three hours before first pitch</strong> on game days. Five-minute read. Statcast, advanced metrics, the matchups that actually matter — no hot takes, no padding.
              </p>
              <p style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#333;margin:0 0 16px 0;">
                MLB now. NBA, NFL, NHL, and EPL roll out over the coming weeks.
              </p>
              <p style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#333;margin:0;">
                The Edge is information, not advice. We tell you what the data says — you decide what it means.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 32px;">
              <div style="border-top:1px solid #ddd;padding-top:20px;">
                <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#999;margin:0 0 12px 0;">
                  Two small things that help us out:
                </p>
                <ul style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.7;color:#666;margin:0;padding-left:18px;">
                  <li>Add <strong>hello@edgereportdaily.com</strong> to your contacts so we don&apos;t end up in spam.</li>
                  <li>Reply with your favorite team — it trains your inbox to recognize us.</li>
                </ul>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 40px;background:#0a0a0a;color:#666;">
              <p style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#999;margin:0 0 12px 0;">
                THE EDGE · EDGEREPORTDAILY.COM
              </p>
              <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#888;margin:0 0 12px 0;">
                You&apos;re receiving this because you signed up at edgereportdaily.com.
              </p>
              <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#666;margin:0;">
                The Edge provides statistical information and analysis only. We do not provide gambling advice, picks, or recommendations. <a href="https://edgereportdaily.com/privacy" style="color:#888;">Privacy</a> · <a href="https://edgereportdaily.com/terms" style="color:#888;">Terms</a> · <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `Welcome to The Edge.

One quick thing before tomorrow morning's brief.

→ STEP 1: Tell us your teams.
We'll only send briefs for games featuring teams you actually care about. Takes 30 seconds.
${preferencesUrl}

The brief lands three hours before first pitch on game days. Five-minute read. Statcast, advanced metrics, the matchups that actually matter.

MLB now. NBA, NFL, NHL, and EPL roll out over the coming weeks.

The Edge is information, not advice. We tell you what the data says — you decide what it means.

A couple of things that help:
- Add hello@edgereportdaily.com to your contacts
- Reply with your favorite team

— The Edge

Unsubscribe: ${unsubscribeUrl}
Privacy: https://edgereportdaily.com/privacy · Terms: https://edgereportdaily.com/terms`,
  }
}
// =====================================================
// DAILY BRIEF — sent each morning to subscribers
// =====================================================

import type { MLBGame } from '@/lib/mlb'

export type BriefGameContext = {
  game: MLBGame
  awaySeasonStats: { era: string; whip: string; k_per_9: string; wins: number; losses: number } | null
  homeSeasonStats: { era: string; whip: string; k_per_9: string; wins: number; losses: number } | null
  weather: { temp_f: number; wind_mph: number; wind_direction_text: string; conditions: string; precipitation_chance: number } | null
  windImpact: string | null
  venueName: string
  isIndoor: boolean
  slug: string
}

export function dailyBriefEmail(
  email: string,
  preferencesToken: string,
  games: BriefGameContext[],
  teamShortNames: string[]
) {
  const preferencesUrl = `https://edgereportdaily.com/preferences/${preferencesToken}`
  const unsubscribeUrl = `https://edgereportdaily.com/api/unsubscribe?email=${encodeURIComponent(email)}`

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  const teamLabel = teamShortNames.length === 0
    ? 'your teams'
    : teamShortNames.length <= 2
      ? teamShortNames.join(' & ')
      : `${teamShortNames.slice(0, 2).join(', ')} +${teamShortNames.length - 2}`

  const gameSections = games.map((ctx) => {
    const { game, awaySeasonStats, homeSeasonStats, weather, windImpact, isIndoor, slug } = ctx
    const awayTeam = game.teams.away.team.name
    const homeTeam = game.teams.home.team.name
    const awayShort = awayTeam.split(' ').pop()
    const homeShort = homeTeam.split(' ').pop()
    const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    })
    const previewUrl = `https://edgereportdaily.com/mlb/${slug}`

    const awayPitcher = game.teams.away.probablePitcher
    const homePitcher = game.teams.home.probablePitcher

  return `
      <tr><td style="padding:32px 40px 8px;border-top:2px solid #1a1a1a;">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#ff5722;text-transform:uppercase;margin-bottom:12px;">
          ${gameTime} · ${ctx.venueName}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
          <td style="padding-right:14px;vertical-align:middle;width:48px;">
            <div style="width:44px;height:44px;background:#fff;border-radius:50%;display:inline-block;text-align:center;line-height:44px;">
              <img src="https://www.mlbstatic.com/team-logos/team-cap-on-light/${game.teams.away.team.id}.svg" alt="" width="36" height="36" style="vertical-align:middle;display:inline-block;">
            </div>
          </td>
          <td style="vertical-align:middle;padding-right:10px;">
            <div style="font-family:Georgia,serif;font-size:28px;line-height:1;letter-spacing:-1px;color:#1a1a1a;font-weight:700;">${awayShort}</div>
          </td>
          <td style="vertical-align:middle;padding-right:10px;">
            <div style="font-family:Georgia,serif;font-style:italic;font-size:16px;color:#999;font-weight:300;">at</div>
          </td>
          <td style="padding-right:14px;vertical-align:middle;width:48px;">
            <div style="width:44px;height:44px;background:#fff;border-radius:50%;display:inline-block;text-align:center;line-height:44px;">
              <img src="https://www.mlbstatic.com/team-logos/team-cap-on-light/${game.teams.home.team.id}.svg" alt="" width="36" height="36" style="vertical-align:middle;display:inline-block;">
            </div>
          </td>
          <td style="vertical-align:middle;">
            <div style="font-family:Georgia,serif;font-size:28px;line-height:1;letter-spacing:-1px;color:#1a1a1a;font-weight:700;">${homeShort}</div>
          </td>
        </tr></table>
      </td></tr>

      ${(awayPitcher || homePitcher) ? `
      <tr><td style="padding:16px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
  ${awayPitcher && awaySeasonStats ? `
            <td width="50%" style="padding-right:12px;vertical-align:top;">
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:8px;">${awayShort}</div>
              <img src="https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_auto,w_180,h_180,q_auto:best/v1/people/${awayPitcher.id}/headshot/67/current" alt="${awayPitcher.fullName}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;background:#eee;margin-bottom:8px;object-fit:cover;-ms-interpolation-mode:bicubic;">
              <div style="font-family:Georgia,serif;font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.25;margin-bottom:8px;">${awayPitcher.fullName}</div>
              <div style="font-family:'Courier New',monospace;font-size:12px;color:#666;line-height:1.6;">
                ERA <strong style="color:#1a1a1a;">${awaySeasonStats.era}</strong><br>
                WHIP <strong style="color:#1a1a1a;">${awaySeasonStats.whip}</strong><br>
                K/9 <strong style="color:#1a1a1a;">${awaySeasonStats.k_per_9}</strong>
              </div>
            </td>
            ` : `<td width="50%" style="vertical-align:top;color:#999;font-style:italic;font-family:Georgia,serif;padding:20px 12px;">SP TBD</td>`}
          ${homePitcher && homeSeasonStats ? `
            <td width="50%" style="padding-right:12px;vertical-align:top;">
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:8px;">${homeShort}</div>
              <img src="https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_auto,w_180,h_180,q_auto:best/v1/people/${homePitcher.id}/headshot/67/current" alt="${homePitcher.fullName}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;background:#eee;margin-bottom:8px;object-fit:cover;-ms-interpolation-mode:bicubic;">
              <div style="font-family:Georgia,serif;font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.25;margin-bottom:8px;">${homePitcher.fullName}</div>
              <div style="font-family:'Courier New',monospace;font-size:12px;color:#666;line-height:1.6;">
                ERA <strong style="color:#1a1a1a;">${homeSeasonStats.era}</strong><br>
                WHIP <strong style="color:#1a1a1a;">${homeSeasonStats.whip}</strong><br>
                K/9 <strong style="color:#1a1a1a;">${homeSeasonStats.k_per_9}</strong>
              </div>
            </td>
            ` : `<td width="50%" style="vertical-align:top;color:#999;font-style:italic;font-family:Georgia,serif;padding:20px 12px;">SP TBD</td>`}
          </tr>
        </table>
      </td></tr>
      ` : ''}

      ${(weather || isIndoor) ? `
      <tr><td style="padding:16px 40px;">
        <div style="background:#fafaf5;padding:14px 16px;border-left:3px solid #ff5722;">
          <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#ff5722;margin-bottom:4px;">Conditions</div>
          ${isIndoor ? `
            <div style="font-family:Georgia,serif;font-size:14px;color:#333;">Indoors. Climate-controlled.</div>
          ` : weather ? `
            <div style="font-family:Georgia,serif;font-size:14px;color:#333;line-height:1.5;">
              <strong>${weather.temp_f}°F</strong> · ${weather.conditions} · wind ${weather.wind_mph} mph from ${weather.wind_direction_text} · ${weather.precipitation_chance}% precip
            </div>
            ${windImpact ? `
              <div style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;color:#ff5722;margin-top:6px;">→ ${windImpact}</div>
            ` : ''}
          ` : ''}
        </div>
      </td></tr>
      ` : ''}

      <tr><td style="padding:8px 40px 24px;">
        <a href="${previewUrl}" style="display:inline-block;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#ff5722;text-decoration:none;font-weight:600;letter-spacing:0.5px;">
          Read the full preview →
        </a>
      </td></tr>
    `
  }).join('')

  return {
    subject: `${teamLabel} tonight · The Edge`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>The Edge Daily — ${dateStr}</title>
</head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;max-width:640px;width:100%;">

        <tr><td style="padding:32px 40px 24px;border-bottom:2px solid #1a1a1a;">
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;color:#666;text-transform:uppercase;margin-bottom:16px;">
            The Edge Daily · ${dateStr}
          </div>
          <div style="font-family:Georgia,serif;font-size:36px;font-weight:900;letter-spacing:-1px;color:#1a1a1a;line-height:1;">
            The Edge<span style="color:#ff5722;">.</span>
          </div>
        </td></tr>

        <tr><td style="padding:36px 40px 16px;">
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;color:#ff5722;text-transform:uppercase;margin-bottom:12px;">
            ${games.length === 1 ? '1 game tonight' : `${games.length} games tonight`}
          </div>
          <h1 style="font-family:Georgia,serif;font-size:30px;line-height:1.15;color:#1a1a1a;margin:0 0 12px 0;font-weight:600;letter-spacing:-1px;">
            Five-minute brief for ${teamLabel}.
          </h1>
          <p style="font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#555;margin:0;">
            Statcast, advanced metrics, the matchups that actually matter. Information only — no advice.
          </p>
        </td></tr>

        ${gameSections}

        <tr><td style="padding:32px 40px;background:#1a1a1a;color:#f4f1ea;">
          <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#dcfa3c;text-transform:uppercase;margin-bottom:12px;">
            Want different teams?
          </div>
          <p style="font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#ddd;margin:0 0 16px 0;">
            Update your team picks anytime — we'll send briefs only for games you care about.
          </p>
          <a href="${preferencesUrl}" style="display:inline-block;background:#dcfa3c;color:#1a1a1a;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:13px;padding:12px 22px;text-decoration:none;letter-spacing:0.5px;">
            Manage preferences →
          </a>
        </td></tr>

        <tr><td style="padding:24px 40px;background:#0a0a0a;color:#666;">
          <p style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#999;margin:0 0 12px 0;">
            THE EDGE · EDGEREPORTDAILY.COM
          </p>
          <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#666;margin:0;">
            The Edge provides statistical information and analysis only. We do not provide gambling advice, picks, or recommendations. <a href="https://edgereportdaily.com/privacy" style="color:#888;">Privacy</a> · <a href="https://edgereportdaily.com/terms" style="color:#888;">Terms</a> · <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
    text: `THE EDGE DAILY — ${dateStr}

${games.length === 1 ? '1 game tonight' : `${games.length} games tonight`} for ${teamLabel}.

${games.map(ctx => {
  const awayShort = ctx.game.teams.away.team.name.split(' ').pop()
  const homeShort = ctx.game.teams.home.team.name.split(' ').pop()
  const gameTime = new Date(ctx.game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  })
  const aw = ctx.game.teams.away.probablePitcher?.fullName ?? 'TBD'
  const hw = ctx.game.teams.home.probablePitcher?.fullName ?? 'TBD'
  const aera = ctx.awaySeasonStats?.era ?? '–'
  const hera = ctx.homeSeasonStats?.era ?? '–'
  const weatherLine = ctx.isIndoor
    ? 'Indoors'
    : ctx.weather
      ? `${ctx.weather.temp_f}°F, ${ctx.weather.conditions}, wind ${ctx.weather.wind_mph}mph${ctx.windImpact ? ' — ' + ctx.windImpact : ''}`
      : ''
  return `
${awayShort} at ${homeShort}
${gameTime} · ${ctx.venueName}

${aw} (${aera} ERA) vs ${hw} (${hera} ERA)
${weatherLine ? weatherLine + '\n' : ''}
Full preview: https://edgereportdaily.com/mlb/${ctx.slug}
`
}).join('\n---\n')}

Manage preferences: ${preferencesUrl}
Unsubscribe: ${unsubscribeUrl}
`,
  }
}


// =====================================================
// VERIFICATION EMAIL — sent on first signup, before welcome
// =====================================================

export function verificationEmail(email: string, token: string) {
  const verifyUrl = `https://edgereportdaily.com/api/verify?token=${token}`

  return {
    subject: "Confirm your email · The Edge",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Confirm your email</title>
</head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;max-width:600px;width:100%;">

        <tr><td style="padding:32px 40px 24px;border-bottom:2px solid #1a1a1a;">
          <div style="font-family:Georgia,serif;font-size:32px;font-weight:900;letter-spacing:-1px;color:#1a1a1a;">
            The Edge<span style="color:#ff5722;">.</span>
          </div>
        </td></tr>

        <tr><td style="padding:36px 40px 24px;">
          <h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.2;color:#1a1a1a;margin:0 0 16px 0;font-weight:600;letter-spacing:-1px;">
            Confirm your email.
          </h1>
          <p style="font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#444;margin:0 0 24px 0;">
            One quick click and you're set up. We won't send anything else until you do — that's how we keep this list clean.
          </p>
          <a href="${verifyUrl}" style="display:inline-block;background:#1a1a1a;color:#dcfa3c;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:14px;padding:14px 28px;text-decoration:none;letter-spacing:0.5px;">
            Confirm email →
          </a>
          <p style="font-family:Georgia,serif;font-size:13px;line-height:1.5;color:#888;margin:24px 0 0 0;">
            Didn't sign up? You can safely ignore this email — without confirmation, you won't receive anything.
          </p>
        </td></tr>

        <tr><td style="padding:24px 40px;background:#0a0a0a;color:#666;">
          <p style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#999;margin:0;">
            THE EDGE · EDGEREPORTDAILY.COM
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
    text: `Confirm your email — The Edge

One click and you're set up:
${verifyUrl}

Didn't sign up? Ignore this email and nothing happens.

— The Edge`,
  }
}