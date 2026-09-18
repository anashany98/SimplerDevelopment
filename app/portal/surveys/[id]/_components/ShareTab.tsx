'use client';

/**
 * ShareTab — public link, embed code, and integration callouts.
 *
 * Lifted verbatim from page.tsx. The page owns the publicUrl + clipboard
 * state so we accept those via props.
 */

import type { Survey } from '../_lib/api';

interface Props {
  survey: Survey;
  publicUrl: string;
  copied: boolean;
  onCopyLink: () => void;
  onCopyEmbed: () => void;
}

export default function ShareTab({ survey, publicUrl, copied, onCopyLink, onCopyEmbed }: Props) {
  const embedSnippet = `<iframe src="${publicUrl}?embed=1" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px;"></iframe>`;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">link</span>
          Enlace público
        </h3>
        <p className="text-sm text-muted-foreground">Comparte este enlace con quien quieras para recopilar respuestas</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={publicUrl}
            className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground font-mono"
          />
          <button
            onClick={onCopyLink}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-lg">{copied ? 'check' : 'content_copy'}</span>
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">code</span>
          Incrustar en sitio web
        </h3>
        <p className="text-sm text-muted-foreground">Inserta esta encuesta en cualquier sitio web o en los sitios de tus clientes</p>
        <div className="bg-muted border border-border rounded-lg p-3">
          <code className="text-xs text-foreground font-mono break-all">{embedSnippet}</code>
        </div>
        <button
          onClick={onCopyEmbed}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <span className="material-icons text-lg">{copied ? 'check' : 'content_copy'}</span>
          {copied ? '¡Copiado!' : 'Copiar código de inserción'}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">hub</span>
          Integraciones
        </h3>
        <p className="text-sm text-muted-foreground">
          Conecta esta encuesta con otras herramientas para una distribución automática
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">email</span>
              <p className="font-medium text-foreground text-sm">Campañas de email</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Incluye el enlace de la encuesta en campañas de correo. Añade{' '}
              <code className="bg-muted px-1 rounded">{`{{survey:${survey.slug}}}`}</code> a cualquier
              plantilla de correo.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">handshake</span>
              <p className="font-medium text-foreground text-sm">Tratos y propuestas del CRM</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Adjunta un trato o una propuesta. Las respuestas se vinculan al registro del contacto para dar seguimiento.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">calendar_month</span>
              <p className="font-medium text-foreground text-sm">Seguimiento de reservas</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Envía la encuesta después de completar una reserva. Configúralo en Automatizaciones con
              el disparador &ldquo;booking.completed&rdquo;.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">web</span>
              <p className="font-medium text-foreground text-sm">Incrustar en la web</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Usa el código de inserción de arriba o añade la encuesta a tu sitio con el bloque HTML personalizado del constructor web.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
