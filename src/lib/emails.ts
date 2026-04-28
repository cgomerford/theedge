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