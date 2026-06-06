import { generateMatchupTiltEmailBlock } from './matchup-tilt-email';
import { buildMatchupTiltData } from './matchup-tilt';
import type { ComponentsRaw, ComponentScores } from './matchup-tilt';
import { findTeamByName } from '@/lib/teams';

export function welcomeEmail(email: string, preferencesToken: string) {
  const preferencesUrl = `https://edgereportdaily.com/preferences/${preferencesToken}`;
  const unsubscribeUrl = `https://edgereportdaily.com/api/unsubscribe?email=${encodeURIComponent(email)}`;

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
                MLB now. NFL launching August, NBA and NHL following in October.
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
            <td style="padding:24px 40px;background:#f4f1ea;border-top:1px solid #ddd;">
              <p style="font-family:Georgia,serif;font-size:13px;line-height:1.6;color:#555;margin:0 0 8px 0;">
                <strong>Got feedback?</strong> Found something broken or have a thought?
                <a href="https://docs.google.com/forms/d/e/1FAIpQLSc2ARao0o34I6aQl-Bl0d-FtBj5y-JvC03OcChgxuX9__2LuA/viewform" style="color:#ff5722;text-decoration:underline;">Tell us here</a> — goes straight to George.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px;background:#0a0a0a;">
              <p style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#999;margin:0 0 8px 0;">
                THE EDGE · EDGEREPORTDAILY.COM
              </p>
              <p style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.6;color:#666;margin:0;">
                Information only · Not gambling advice ·
                <a href="https://edgereportdaily.com/privacy" style="color:#888;">Privacy</a> ·
                <a href="https://edgereportdaily.com/terms" style="color:#888;">Terms</a> ·
                <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>
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

MLB now. NFL, NBA and NHL coming.

The Edge is information, not advice. We tell you what the data says — you decide what it means.

---
Got feedback? Tell us here: https://docs.google.com/forms/d/e/1FAIpQLSc2ARao0o34I6aQl-Bl0d-FtBj5y-JvC03OcChgxuX9__2LuA/viewform

Unsubscribe: ${unsubscribeUrl}
Privacy: https://edgereportdaily.com/privacy
Terms: https://edgereportdaily.com/terms`,
  };
}

// =====================================================
// V2 EMAIL BLOCKS
// =====================================================

function buildEdgeIndicatorBlock(ctx: BriefGameContext): string {
  if (ctx.edge_score === null || ctx.predicted_winner === null) {
    return '';
  }

  const edgeScore = ctx.edge_score;
  const tier = ctx.confidence_tier ?? 'tossup';

  const winnerTeam = ctx.predicted_winner === 'home'
    ? ctx.game.teams.home.team.name
    : ctx.game.teams.away.team.name;
  const winnerShort = winnerTeam.split(' ').pop()?.toUpperCase() ?? '';

  const tierLabel = tier === 'strong' ? 'STRONG EDGE'
    : tier === 'moderate' ? 'MODERATE EDGE'
    : tier === 'slight' ? 'SLIGHT EDGE'
    : 'TOSS-UP';

  const tierColor = tier === 'strong' ? '#FF5722'
    : tier === 'moderate' ? '#dcfa3c'
    : tier === 'slight' ? '#dcfa3c'
    : '#999';

  const sign = edgeScore >= 0 ? '+' : '';
  const displayScore = `${sign}${Math.round(edgeScore)}`;

  if (tier === 'tossup') {
    return `
      <tr><td style="padding:0 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;">
          <tr>
            <td style="padding:20px 24px;">
              <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#dcfa3c;text-transform:uppercase;margin-bottom:8px;">
                ⊕ The Edge Indicator
              </div>
              <div style="font-family:Georgia,serif;font-size:28px;line-height:1.1;color:#fff;font-weight:700;letter-spacing:-1px;margin-bottom:6px;">
                Toss-up
              </div>
              <div style="font-family:Georgia,serif;font-size:14px;color:#999;line-height:1.5;">
                Edge Score ${displayScore} — too close to call.
              </div>
            </td>
          </tr>
        </table>
      </td></tr>
    `;
  }

  return `
    <tr><td style="padding:0 40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;">
        <tr>
          <td style="padding:24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:top;padding-right:20px;">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#dcfa3c;text-transform:uppercase;margin-bottom:6px;">
                    ⊕ Edge Indicator
                  </div>
                  <div style="font-family:Georgia,serif;font-size:48px;line-height:1;color:#dcfa3c;font-weight:900;letter-spacing:-2px;">
                    ${displayScore}
                  </div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:${tierColor};text-transform:uppercase;margin-bottom:8px;">
                    — ${tierLabel}
                  </div>
                 <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;color:#999;text-transform:uppercase;margin-bottom:4px;">
  Edge favors
</div>
<div style="font-family:Georgia,serif;font-size:28px;line-height:1.05;color:#fff;font-weight:700;letter-spacing:-1px;margin-bottom:8px;">
  ${winnerShort}
</div>
                  ${ctx.llm_summary ? `
                    <div style="font-family:Georgia,serif;font-style:italic;font-size:13px;line-height:1.5;color:#ccc;margin-top:8px;">
                      "${ctx.llm_summary}"
                    </div>
                  ` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function buildNarrativeBlock(ctx: BriefGameContext, isPro: boolean = false): string {
  if (!ctx.llm_narrative) return '';

  const label = isPro ? '— The GM Briefing' : '— The Read';

  return `
  <tr><td style="padding:20px 40px 24px;">
      <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#ff5722;text-transform:uppercase;margin-bottom:10px;">
        ${label}
      </div>
      <p style="font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 8px 0;">
        ${ctx.llm_narrative}
      </p>
    </td></tr>
  `;
}

// =====================================================
// DAILY BRIEF
// =====================================================

import type { MLBGame } from '@/lib/mlb';

export type BriefGameContext = {
  game: MLBGame;
  awaySeasonStats: { era: string; whip: string; k_per_9: string; wins: number; losses: number } | null;
  homeSeasonStats: { era: string; whip: string; k_per_9: string; wins: number; losses: number } | null;
  weather: { temp_f: number; wind_mph: number; wind_direction_text: string; conditions: string; precipitation_chance: number } | null;
  windImpact: string | null;
  venueName: string;
  isIndoor: boolean;
  slug: string;
  edge_score: number | null;
  predicted_winner: 'home' | 'away' | null;
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup' | null;
  llm_summary: string | null;
  llm_narrative: string | null;
  llm_narrative_pro?: string | null;
  components?: any | null;
  components_raw?: any | null;
};

export function dailyBriefEmail(
  email: string,
  preferencesToken: string,
  games: BriefGameContext[],
  teamShortNames: string[],
  isPro: boolean = false,
) {
  const preferencesUrl = `https://edgereportdaily.com/preferences/${preferencesToken}`;
  const unsubscribeUrl = `https://edgereportdaily.com/api/unsubscribe?email=${encodeURIComponent(email)}`;

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const teamLabel = teamShortNames.length === 0
    ? 'your teams'
    : teamShortNames.length <= 2
    ? teamShortNames.join(' & ')
    : `${teamShortNames.slice(0, 2).join(', ')} +${teamShortNames.length - 2}`;

  const gameSections = games.map((ctx) => {
    const { game, awaySeasonStats, homeSeasonStats, weather, windImpact, isIndoor, slug } = ctx;

    const awayTeamName = game.teams.away.team.name;
    const homeTeamName = game.teams.home.team.name;
    const awayShort = awayTeamName.split(' ').pop() || 'AWAY';
    const homeShort = homeTeamName.split(' ').pop() || 'HOME';

    const gameTime = new Date(game.gameDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    });

    const previewUrl = `https://edgereportdaily.com/mlb/${slug}`;

    const awayPitcher = game.teams.away.probablePitcher;
    const homePitcher = game.teams.home.probablePitcher;

    // === CORRECTED CALL (home 3rd, away 4th to match function signature) ===
    let tiltBlock = '';
    if (ctx.components_raw && ctx.components) {
      try {
        const tiltData = buildMatchupTiltData(
          ctx.components_raw as ComponentsRaw,
          ctx.components as ComponentScores,
          { abbr: homeShort.toUpperCase(), name: homeTeamName, primaryColor: '#CC0C00' }, // HOME
          { abbr: awayShort.toUpperCase(), name: awayTeamName, primaryColor: '#002D72' }, // AWAY
          ctx.venueName,
          gameTime,
        );
        tiltBlock = `<tr><td style="padding:0 40px 16px;">${generateMatchupTiltEmailBlock(tiltData)}</td></tr>`;
      } catch (e) {
        console.error('Tilt email block failed, falling back to Edge Indicator', e);
      }
    }

    return `
      <tr><td style="padding:32px 40px 8px;border-top:2px solid #1a1a1a;">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:#ff5722;text-transform:uppercase;margin-bottom:12px;">
          ${gameTime} · ${ctx.venueName}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
            <td style="padding-right:14px;vertical-align:middle;width:48px;">
              <div style="width:44px;height:48px;background:#fff;border-radius:50%;display:inline-block;text-align:center;line-height:44px;padding:0;border:1px solid #eee;">
                <img src="https://midfield.mlbstatic.com/v1/team/${game.teams.away.team.id}/spots/72" alt="" width="48" height="48" style="vertical-align:middle;display:inline-block;">
              </div>
            </td>
            <td style="vertical-align:middle;padding-right:10px;">
              <div style="font-family:Georgia,serif;font-size:28px;line-height:1;letter-spacing:-1px;color:#1a1a1a;font-weight:700;">${awayShort}</div>
            </td>
            <td style="vertical-align:middle;padding-right:10px;">
              <div style="font-family:Georgia,serif;font-style:italic;font-size:16px;color:#999;font-weight:300;">at</div>
            </td>
            <td style="padding-right:14px;vertical-align:middle;width:48px;">
              <div style="width:44px;height:48px;background:#fff;border-radius:50%;display:inline-block;text-align:center;line-height:44px;padding:0;border:1px solid #eee;">
                <img src="https://midfield.mlbstatic.com/v1/team/${game.teams.home.team.id}/spots/72" alt="" width="48" height="48" style="vertical-align:middle;display:inline-block;">
              </div>
            </td>
            <td style="vertical-align:middle;">
              <div style="font-family:Georgia,serif;font-size:28px;line-height:1;letter-spacing:-1px;color:#1a1a1a;font-weight:700;">${homeShort}</div>
            </td>
          </tr>
        </table>
      </td></tr>

      ${tiltBlock || buildEdgeIndicatorBlock(ctx)}
      ${buildNarrativeBlock(ctx, isPro)}

      ${(awayPitcher || homePitcher) ? `
      <tr><td style="padding:16px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${awayPitcher && awaySeasonStats ? `
            <td width="50%" style="padding-right:12px;vertical-align:top;">
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:8px;">${awayShort}</div>
              <img src="https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_face,w_180,h_180,q_auto:best/v1/people/${awayPitcher.id}/headshot/67/current" alt="${awayPitcher.fullName}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;background:#eee;margin-bottom:8px;object-fit:cover;-ms-interpolation-mode:bicubic;">
              <div style="font-family:Georgia,serif;font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.25;margin-bottom:8px;">${awayPitcher.fullName}</div>
              <div style="font-family:'Courier New',monospace;font-size:12px;color:#666;line-height:1.6;">
                ERA <strong style="color:#1a1a1a;">${awaySeasonStats.era}</strong><br>
                WHIP <strong style="color:#1a1a1a;">${awaySeasonStats.whip}</strong><br>
                K/9 <strong style="color:#1a1a1a;">${awaySeasonStats.k_per_9}</strong>
              </div>
            </td>` : `<td width="50%" style="vertical-align:top;color:#999;font-style:italic;font-family:Georgia,serif;padding:20px 12px;">SP TBD</td>`}
            ${homePitcher && homeSeasonStats ? `
            <td width="50%" style="padding-right:12px;vertical-align:top;">
              <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:8px;">${homeShort}</div>
              <img src="https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_face,w_180,h_180,q_auto:best/v1/people/${homePitcher.id}/headshot/67/current" alt="${homePitcher.fullName}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:50%;background:#eee;margin-bottom:8px;object-fit:cover;-ms-interpolation-mode:bicubic;">
              <div style="font-family:Georgia,serif;font-size:16px;font-weight:600;color:#1a1a1a;line-height:1.25;margin-bottom:8px;">${homePitcher.fullName}</div>
              <div style="font-family:'Courier New',monospace;font-size:12px;color:#666;line-height:1.6;">
                ERA <strong style="color:#1a1a1a;">${homeSeasonStats.era}</strong><br>
                WHIP <strong style="color:#1a1a1a;">${homeSeasonStats.whip}</strong><br>
                K/9 <strong style="color:#1a1a1a;">${homeSeasonStats.k_per_9}</strong>
              </div>
            </td>` : `<td width="50%" style="vertical-align:top;color:#999;font-style:italic;font-family:Georgia,serif;padding:20px 12px;">SP TBD</td>`}
          </tr>
        </table>
      </td></tr>` : ''}

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
            ${windImpact ? `<div style="font-family:'Courier New',monospace;font-size:11px;text-transform:uppercase;color:#ff5722;margin-top:6px;">→ ${windImpact}</div>` : ''}
          ` : ''}
        </div>
      </td></tr>` : ''}

      <tr><td style="padding:8px 40px 24px;">
        <a href="${previewUrl}" style="display:inline-block;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#ff5722;text-decoration:none;font-weight:600;letter-spacing:0.5px;">
          Read the full preview →
        </a>
      </td></tr>
    `;
  }).join('');

  const strongestGame = games
    .filter(g => g.edge_score !== null && g.confidence_tier !== 'tossup')
    .sort((a, b) => Math.abs(b.edge_score ?? 0) - Math.abs(a.edge_score ?? 0))[0];

  const subjectExtra = strongestGame
    ? ` · ${strongestGame.confidence_tier === 'strong' ? 'Strong' : strongestGame.confidence_tier === 'moderate' ? 'Moderate' : 'Slight'} edge to ${(strongestGame.predicted_winner === 'home' ? strongestGame.game.teams.home.team.name : strongestGame.game.teams.away.team.name).split(' ').pop()}`
    : '';

  return {
    subject: `${teamLabel} tonight${subjectExtra} · The Edge`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
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
            The Edge provides statistical information and analysis only. We do not provide gambling advice, picks, or recommendations. 
            <a href="https://edgereportdaily.com/privacy" style="color:#888;">Privacy</a> · 
            <a href="https://edgereportdaily.com/terms" style="color:#888;">Terms</a> · 
            <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a>
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
  const awayShort = ctx.game.teams.away.team.name.split(' ').pop();
  const homeShort = ctx.game.teams.home.team.name.split(' ').pop();
  const gameTime = new Date(ctx.game.gameDate).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
  const aw = ctx.game.teams.away.probablePitcher?.fullName ?? 'TBD';
  const hw = ctx.game.teams.home.probablePitcher?.fullName ?? 'TBD';
  const aera = ctx.awaySeasonStats?.era ?? '–';
  const hera = ctx.homeSeasonStats?.era ?? '–';
  const weatherLine = ctx.isIndoor
    ? 'Indoors'
    : ctx.weather
    ? `${ctx.weather.temp_f}°F, ${ctx.weather.conditions}, wind ${ctx.weather.wind_mph}mph${ctx.windImpact ? ' — ' + ctx.windImpact : ''}`
    : '';
  return `
${awayShort} at ${homeShort}
${gameTime} · ${ctx.venueName}

${aw} (${aera} ERA) vs ${hw} (${hera} ERA)
${weatherLine ? weatherLine + '\n' : ''}
Full preview: https://edgereportdaily.com/mlb/${ctx.slug}
`;
}).join('\n---\n')}

Manage preferences: ${preferencesUrl}
Unsubscribe: ${unsubscribeUrl}
`,
  };
}

// =====================================================
// VERIFICATION EMAIL
// =====================================================
export function verificationEmail(email: string, token: string) {
  const verifyUrl = `https://edgereportdaily.com/api/verify?token=${token}`;

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
  };
}

// =====================================================
// LOGIN LINK EMAIL
// =====================================================
export function loginLinkEmail(email: string, token: string) {
  const loginUrl = `https://edgereportdaily.com/api/auth/callback?token=${token}`;

  return {
    subject: "Your sign-in link · The Edge",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
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
          <h1 style="font-family:Georgia,serif;font-size:26px;line-height:1.2;color:#1a1a1a;margin:0 0 16px 0;font-weight:600;">
            Click to sign in.
          </h1>
          <p style="font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#444;margin:0 0 24px 0;">
            Tap the button below to sign in to your account. This link works once and expires in 30 minutes.
          </p>
          <a href="${loginUrl}" style="display:inline-block;background:#1a1a1a;color:#dcfa3c;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:14px;padding:14px 28px;text-decoration:none;letter-spacing:0.5px;">
            Sign in to The Edge →
          </a>
          <p style="font-family:Georgia,serif;font-size:13px;line-height:1.5;color:#888;margin:24px 0 0 0;">
            Didn't request this? Ignore this email — your account is safe.
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
    text: `Click to sign in: ${loginUrl}

This link works once and expires in 30 minutes.

Didn't request this? Ignore this email.`,
  };
}