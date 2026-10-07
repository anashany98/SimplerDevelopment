import { resend } from './index';
import { getConfiguredFromEmail } from './config';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';

interface InviteEmailData {
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  inviterName: string;
  role: string;
  inviteToken: string;
}

export async function sendInviteEmail(data: InviteEmailData) {
  const inviteUrl = `${BASE_URL}/portal/invite/${data.inviteToken}`;

  const roleLabel = {
    owner: 'Propietario',
    admin: 'Administrador',
    member: 'Miembro del equipo',
    viewer: 'Lector',
  }[data.role] || 'Miembro del equipo';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="padding:40px 32px;text-align:center;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <h1 style="margin:0;font-size:24px;font-weight:700;color:#0f172a;">Te han invitado</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">a unirte a <strong>${data.companyName}</strong> en CRM AGENTS</p>
      </div>
      <div style="padding:32px;">
        <p style="font-size:15px;color:#334155;line-height:1.6;">
          Hola ${data.recipientName}:
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;">
          <strong>${data.inviterName}</strong> te ha invitado a unirte a <strong>${data.companyName}</strong> con el rol de <strong>${roleLabel}</strong>.
        </p>
        <p style="font-size:15px;color:#334155;line-height:1.6;">
          Haz clic en el botón de abajo para configurar tu contraseña y acceder al portal.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
            Aceptar invitación
          </a>
        </div>
        <p style="font-size:13px;color:#94a3b8;line-height:1.5;">
          Esta invitación caduca en 7 días. Si el botón no funciona, copia y pega este enlace en tu navegador:
        </p>
        <p style="font-size:13px;color:#3b82f6;word-break:break-all;">
          ${inviteUrl}
        </p>
      </div>
      <div style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          CRM AGENTS &middot; Diseño, Desarrollo y Automatización
        </p>
      </div>
    </div>
  `;

  return resend.emails.send({
    from: `CRM AGENTS <${(await getConfiguredFromEmail()) || 'portal@simplerdevelopment.com'}>`,
    to: data.recipientEmail,
    subject: `${data.inviterName} te ha invitado a ${data.companyName}`,
    html,
  });
}
