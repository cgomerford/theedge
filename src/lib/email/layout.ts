// src/lib/email/layout.ts
//
// Shared shell for every email The Edge sends.
// Owns: HTML head, body wrapper, masthead, footer, hairlines, kickers.
// Editorial Monocle/FT briefing feel — one source of truth for brand tokens.
//
// Templates compose by concatenating row helpers and passing the result
// to wrapEmail({ title, preheader, body }).

// ─── Brand tokens ─────────────────────────────────────────────────────────────

export const SITE_URL = 'https://edgereportdaily.com'

export const COLORS = {
  /** Outer page background — subtle frame around the email card on desktop */
  outer: '#EEEAE0',
  /** Inner email card */
  cream: '#FAF8F3',
  /** Primary ink */
  ink: '#1a1a1a',
  /** Edge orange — used sparingly for kickers and "The Read" mark */
  orange: '#FF5722',
  /** Edge yellow — reserved for transactional emails (Step 1, confirm, etc.) */
  yellow: '#FDE047',
  /** Muted UI grey for datelines and secondary kickers */
  muted: '#999',
  /** Body copy on cream */
  body: '#555',
  /** Light row divider inside the matchup tilt panel */
  rowDivider: '#E8E4DA',
} as const

export const FONTS = {
  serif: `'Fraunces', Georgia, 'Times New Roman', serif`,
  mono: `'Space Mono', 'Courier New', monospace`,
} as const

// ─── Preheader (hidden inbox preview text) ────────────────────────────────────

/**
 * Hidden text that email clients show in the inbox preview pane.
 * Zero-width chars + matching background colour stop adjacent body
 * text from leaking into the preview.
 */
function preheaderHide(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.outer};opacity:0;">${text}</div>`
}

// ─── Layout primitives — every helper returns one or more <tr> rows ──────────

/** Full-width 1-pixel ink hairline with side padding matching the email body. */
export function hairline(): string {
  return `
  <tr><td class="brief-pad" style="padding:0 40px;">
    <div style="border-top:1px solid ${COLORS.ink};height:0;font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>`
}

/** Small monospace caps label. Used for kickers, section markers, datelines. */
export function kicker(
  text: string,
  opts: { color?: string; align?: 'left' | 'right' | 'center'; size?: number; padTop?: number; padBottom?: number } = {},
): string {
  const color = opts.color ?? COLORS.muted
  const align = opts.align ?? 'left'
  const size = opts.size ?? 11
  const padTop = opts.padTop ?? 24
  const padBottom = opts.padBottom ?? 0
  return `
  <tr><td class="brief-pad" style="padding:${padTop}px 40px ${padBottom}px;text-align:${align};">
    <div style="font-family:${FONTS.mono};font-size:${size}px;letter-spacing:0.16em;color:${color};text-transform:uppercase;">
      ${text}
    </div>
  </td></tr>`
}

/** Top-of-email two-column row: brand mark left, date right. */
export function masthead(dateStr: string): string {
  return `
  <tr><td class="brief-pad" style="padding:36px 40px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;color:${COLORS.muted};text-transform:uppercase;">
          The&nbsp;Edge<span style="color:${COLORS.orange};">.</span>&nbsp;&nbsp;·&nbsp;&nbsp;Daily&nbsp;Briefing
        </td>
        <td align="right" style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;color:${COLORS.muted};text-transform:uppercase;">
          ${dateStr}
        </td>
      </tr>
    </table>
  </td></tr>`
}

/** Long serif headline with optional italic dek beneath. The masthead's complement. */
export function editorialHeadline({ title, dek }: { title: string; dek?: string }): string {
  return `
  <tr><td class="brief-pad" style="padding:40px 40px 8px;">
    <h1 class="brief-headline" style="font-family:${FONTS.serif};font-size:44px;line-height:1.05;font-weight:600;letter-spacing:-0.02em;color:${COLORS.ink};margin:0 0 ${dek ? '20px' : '0'} 0;">
      ${title}
    </h1>
    ${dek ? `<p style="font-family:${FONTS.serif};font-style:italic;font-size:19px;line-height:1.5;color:${COLORS.body};margin:0;font-weight:400;">${dek}</p>` : ''}
  </td></tr>`
}

/** Daily-brief footer — italic prompt + two underlined mono links. */
export function briefFooter({
  preferencesUrl,
  unsubscribeUrl,
}: {
  preferencesUrl: string
  unsubscribeUrl: string
}): string {
  return `
  <tr><td class="brief-pad" style="padding:28px 40px 40px;">
    <div style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;color:${COLORS.muted};text-transform:uppercase;margin-bottom:14px;">
      ¶ Manage
    </div>
    <p style="font-family:${FONTS.serif};font-style:italic;font-size:15px;line-height:1.55;color:${COLORS.body};margin:0 0 16px 0;">
      Want different teams, or to stop receiving these?
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding-right:14px;">
          <a href="${preferencesUrl}" style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.08em;color:${COLORS.ink};text-decoration:none;border-bottom:1px solid ${COLORS.ink};padding-bottom:1px;">
            Update preferences →
          </a>
        </td>
        <td>
          <a href="${unsubscribeUrl}" style="font-family:${FONTS.mono};font-size:11px;letter-spacing:0.08em;color:${COLORS.muted};text-decoration:none;">
            Unsubscribe
          </a>
        </td>
      </tr>
    </table>
  </td></tr>`
}

/** Minimal footer for transactional emails — verification, login, welcome. */
export function transactionalFooter(): string {
  return `
  <tr><td class="brief-pad" style="padding:24px 40px 32px;">
    <div style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;color:${COLORS.muted};text-transform:uppercase;">
      The&nbsp;Edge<span style="color:${COLORS.orange};">.</span>&nbsp;&nbsp;·&nbsp;&nbsp;edgereportdaily.com
    </div>
  </td></tr>`
}

// ─── Outer wrapper ────────────────────────────────────────────────────────────

/**
 * Wraps a body of <tr> rows in the full email HTML document.
 * The body should be the concatenation of helpers above + any block functions.
 */
export function wrapEmail({
  title,
  preheader,
  body,
}: {
  title: string
  preheader?: string
  body: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    /* Mobile tuning — Apple Mail, Gmail, modern clients support these */
    @media only screen and (max-width: 480px) {
      .brief-headline { font-size: 32px !important; line-height: 1.08 !important; }
      .brief-game-headline { font-size: 26px !important; }
      .brief-pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${COLORS.outer};font-family:${FONTS.serif};color:${COLORS.ink};-webkit-font-smoothing:antialiased;">
  ${preheader ? preheaderHide(preheader) : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.outer};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cream};max-width:600px;width:100%;">
${body}
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}