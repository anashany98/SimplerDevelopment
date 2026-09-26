/**
 * Pure (no-Resend, no-DB) HTML wrapper for campaign-style email bodies.
 *
 * Re-exported from `lib/email/index.ts` as `buildCampaignHtml` (which keeps
 * existing imports working). Splitting it here lets unit tests import the
 * wrapper without instantiating the Resend SDK at module load time, which
 * blows up when RESEND_API_KEY isn't set.
 */
export function buildCampaignHtmlString(
  htmlContent: string,
  unsubscribeUrl: string,
  previewText?: string | null,
): string {
  const styles: string[] = [];
  const withoutStyles = htmlContent.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi,
    (_style, css: string) => {
      styles.push(`<style type="text/css">${css}</style>`);
      return '';
    },
  );
  const bodyMatch = withoutStyles.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  const bodyContent = bodyMatch
    ? bodyMatch[1]
    : withoutStyles
      .replace(/<!doctype\b[^>]*>/gi, '')
      .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '')
      .replace(/<\/?(?:html|body)\b[^>]*>/gi, '');
  const preview = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtmlText(previewText)}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  ${styles.join('\n  ')}
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  ${preview}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                Recibes este correo porque te suscribiste a nuestra lista.<br />
                <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Cancelar suscripción</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}
