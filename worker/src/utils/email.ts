import { EmailMessage } from 'cloudflare:email';

function buildMime(from: string, to: string, subject: string, html: string): string {
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encodedSubject = `=?UTF-8?B?${btoa(binary)}?=`;

  return [
    'MIME-Version: 1.0',
    `From: MijnLeesHulp <${from}>`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n');
}

export async function sendPasswordResetEmail(
  emailBinding: SendEmail,
  to: string,
  resetToken: string,
  appUrl: string,
  fromEmail: string
): Promise<void> {
  const resetUrl = `${appUrl}/login.html?reset=${resetToken}`;

  const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#4f46e5;padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.5px;">MijnLeesHulp</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">Wachtwoord opnieuw instellen</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
              Je hebt een verzoek ingediend om je wachtwoord te resetten. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#4f46e5;border-radius:8px;">
                  <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Wachtwoord instellen</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;line-height:1.6;">
              Deze link is 1 uur geldig. Als je geen reset hebt aangevraagd, kun je deze e-mail negeren.
            </p>
            <hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;">
              Of kopieer deze URL in je browser:<br>
              <span style="color:#4f46e5;">${resetUrl}</span>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const raw = buildMime(fromEmail, to, 'Wachtwoord reset – MijnLeesHulp', html);
  const message = new EmailMessage(fromEmail, to, raw);
  await emailBinding.send(message);
}
