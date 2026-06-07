import {
  wrapEmail,
  masthead,
  editorialHeadline,
  hairline,
  transactionalFooter,
  SITE_URL,
  COLORS,
  FONTS,
} from './layout'

function ctaButton(href: string, label: string): string {
  return `
  <tr><td class="brief-pad" style="padding:0 40px;">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="${COLORS.ink}" fillcolor="${COLORS.ink}">
    <center style="color:${COLORS.yellow};font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.5px;">${label}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <a href="${href}" style="display:inline-block;background:${COLORS.ink};color:${COLORS.yellow};font-family:${FONTS.mono};font-weight:700;font-size:13px;padding:14px 28px;text-decoration:none;letter-spacing:0.06em;">
      ${label}
    </a>
    <!--<![endif]-->
  </td></tr>`
}

function bodyPara(text: string, opts: { padTop?: number; padBottom?: number; color?: string; italic?: boolean } = {}): string {
  const padTop = opts.padTop ?? 0
  const padBottom = opts.padBottom ?? 0
  const color = opts.color ?? COLORS.body
  const fontStyle = opts.italic ? 'italic' : 'normal'
  return `
  <tr><td class="brief-pad" style="padding:${padTop}px 40px ${padBottom}px;">
    <p style="font-family:${FONTS.serif};font-size:16px;line-height:1.55;color:${color};margin:0;font-style:${fontStyle};">
      ${text}
    </p>
  </td></tr>`
}

function spacer(px: number): string {
  return `<tr><td style="padding-top:${px}px;font-size:0;line-height:0;">&nbsp;</td></tr>`
}

export function verificationEmail(email: string, token: string) {
  const verifyUrl = `${SITE_URL}/api/verify?token=${token}`
  const body = [
    masthead('Verify your email'),
    hairline(),
    editorialHeadline({
      title: 'Confirm your email.',
      dek: 'One quick click and you\'re set up. We won\'t send anything else until you do\u00A0— that\'s how we keep this list clean.',
    }),
    spacer(24),
    ctaButton(verifyUrl, 'Confirm email →'),
    spacer(24),
    bodyPara(
      'Didn\'t sign up? You can safely ignore this email\u00A0— without confirmation, you won\'t receive anything.',
      { color: COLORS.muted, italic: true },
    ),
    spacer(32),
    hairline(),
    transactionalFooter(),
  ].join('')
  return {
    subject: 'Confirm your email · The Edge',
    html: wrapEmail({
      title: 'Confirm your email — The Edge',
      preheader: 'One click to confirm your Edge subscription.',
      body,
    }),
    text: [
      'Confirm your email — The Edge',
      '',
      'One quick click and you\'re set up:',
      verifyUrl,
      '',
      'Didn\'t sign up? Ignore this email and nothing happens.',
      '',
      '— The Edge',
    ].join('\n'),
  }
}

export function welcomeEmail(email: string, preferencesToken: string) {
  const preferencesUrl = `${SITE_URL}/preferences/${preferencesToken}`
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}`
  const body = [
    masthead('Welcome'),
    hairline(),
    editorialHeadline({
      title: 'Welcome to <em style="color:' + COLORS.orange + ';">The Edge.</em>',
      dek: 'One quick thing before tomorrow morning\'s brief.',
    }),
    spacer(8),
    `<tr><td class="brief-pad" style="padding:24px 40px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:${COLORS.ink};padding:28px 24px;text-align:center;">
          <div style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;color:${COLORS.yellow};text-transform:uppercase;margin-bottom:12px;">
            → Step 1
          </div>
          <h2 style="font-family:${FONTS.serif};font-size:24px;line-height:1.15;margin:0 0 12px 0;color:#fff;font-weight:600;">
            Tell us your teams.
          </h2>
          <p style="font-family:${FONTS.serif};font-size:15px;line-height:1.5;color:#ccc;margin:0 0 20px 0;">
            We only send briefs for the games you care about. Pick your teams and you'll get your first brief tomorrow morning.
          </p>
          <a href="${preferencesUrl}" style="display:inline-block;background:${COLORS.yellow};color:${COLORS.ink};font-family:${FONTS.mono};font-weight:700;font-size:13px;padding:12px 24px;text-decoration:none;letter-spacing:0.06em;">
            Pick your teams →
          </a>
        </td></tr>
      </table>
    </td></tr>`,
    spacer(24),
    bodyPara('Each morning you\'ll get a brief covering your teams\' games that day\u00A0— starting pitchers, matchup analysis, conditions, and a five-minute read that puts it all in context.', { padTop: 8 }),
    spacer(8),
    bodyPara('Information only. No advice, no tips, no gambling angles. Just the analysis.', { italic: true, color: COLORS.muted }),
    spacer(32),
    hairline(),
    `<tr><td class="brief-pad" style="padding:24px 40px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.18em;color:${COLORS.muted};text-transform:uppercase;">
            The&nbsp;Edge<span style="color:${COLORS.orange};">.</span>&nbsp;&nbsp;·&nbsp;&nbsp;edgereportdaily.com
          </td>
          <td align="right">
            <a href="${unsubscribeUrl}" style="font-family:${FONTS.mono};font-size:10px;letter-spacing:0.08em;color:${COLORS.muted};text-decoration:none;">
              Unsubscribe
            </a>
          </td>
        </tr>
      </table>
    </td></tr>`,
  ].join('')
  return {
    subject: 'Welcome to The Edge — pick your teams.',
    html: wrapEmail({ title: 'Welcome to The Edge', preheader: 'You\'re in. Pick your teams to get your first morning brief.', body }),
    text: [
      'Welcome to The Edge.',
      '',
      'Pick your teams: ' + preferencesUrl,
      '',
      'We only send briefs for games you care about.',
      '',
      'Unsubscribe: ' + unsubscribeUrl,
    ].join('\n'),
  }
}

export function loginLinkEmail(email: string, token: string) {
  const loginUrl = `${SITE_URL}/api/auth/callback?token=${token}`
  const body = [
    masthead('Sign in'),
    hairline(),
    editorialHeadline({ title: 'Click to sign in.' }),
    spacer(4),
    bodyPara('Tap the button below to sign in to your account. This link works once and expires in 30\u00A0minutes.'),
    spacer(20),
    ctaButton(loginUrl, 'Sign in →'),
    spacer(24),
    bodyPara('Didn\'t request this? You can safely ignore it\u00A0— your account is not affected.', { color: COLORS.muted, italic: true }),
    spacer(32),
    hairline(),
    transactionalFooter(),
  ].join('')
  return {
    subject: 'Your sign-in link · The Edge',
    html: wrapEmail({ title: 'Sign in — The Edge', preheader: 'Your one-time sign-in link for The Edge.', body }),
    text: ['Sign in to The Edge', '', loginUrl, '', 'Expires in 30 minutes. Didn\'t request this? Ignore it.'].join('\n'),
  }
}
