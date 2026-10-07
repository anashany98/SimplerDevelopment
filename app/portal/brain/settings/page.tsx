'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import type { BrainEnabledModules } from '@/lib/db/schema';
import type { BrainProfile } from '@/lib/brain/profiles';
import type { IndustryTemplate } from '@/lib/brain/industry-templates';
import PortalPageHeader from '@/components/portal/PortalPageHeader';
import { pBtnGhost, pBtnPrimary, pSectionTitle } from '@/components/portal/portal-ui';

interface SettingsResponse {
  success: boolean;
  data?: {
    profile: BrainProfile;
    template: IndustryTemplate;
    availableTemplates: IndustryTemplate[];
  };
  message?: string;
}

const CONFIDENTIALITY_OPTIONS = [
  { id: 'standard', label: 'Estándar', help: 'Visible para todos los miembros del equipo.' },
  { id: 'restricted', label: 'Restringido', help: 'Visible para administradores y miembros con permiso explícito.' },
  { id: 'confidential', label: 'Confidencial', help: 'Visible solo para el propietario y los administradores. Recomendado para sectores con requisitos de cumplimiento.' },
] as const;

const MODULE_OPTIONS: { id: keyof BrainEnabledModules; label: string; help: string }[] = [
  { id: 'meetings', label: 'Comunicaciones', help: 'Ingiere transcripciones de comunicaciones, correos y notas pegadas. La IA resume, una persona aprueba.' },
  { id: 'tasks', label: 'Tareas', help: 'Tareas propias del cerebro con promoción a los tableros de proyectos.' },
  { id: 'calendar', label: 'Calendario', help: 'Vista mensual de tareas, comunicaciones, revisiones de relaciones y eventos programados de forma libre. La fase C añadirá la sincronización con Google Calendar.' },
  { id: 'knowledge', label: 'Conocimiento', help: 'Notas de formato libre vinculadas a relaciones, oportunidades, contactos o comunicaciones — fijables, etiquetables y buscables.' },
  { id: 'prospects', label: 'Prospectos', help: 'Detección de prospectos inactivos sobre las oportunidades del CRM.' },
  { id: 'ask', label: 'Preguntar al cerebro', help: 'Capa de consulta conversacional con citas.' },
  { id: 'automations', label: 'Automatizaciones', help: 'Reglas transversales que se activan ante eventos (reserva, encuesta, oportunidad, tarea) y actúan en tu nombre — creadas con NLP o instaladas desde plantillas.' },
];

export default function BrainSettingsPage() {
  const [profile, setProfile] = useState<BrainProfile | null>(null);
  const [template, setTemplate] = useState<IndustryTemplate | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<IndustryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings');
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'No se pudieron cargar los ajustes.');
      } else {
        setProfile(json.data.profile);
        setTemplate(json.data.template);
        setAvailableTemplates(json.data.availableTemplates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'No se pudieron guardar los cambios.');
        return;
      }
      setProfile(json.data.profile);
      setTemplate(json.data.template);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">autorenew</span>Cargando...</div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          {error || 'Ajustes no disponibles.'}
        </div>
      </div>
    );
  }

  const modules = profile.enabledModules;

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title="Ajustes del cerebro"
        subtitle="Configura cómo se comporta Company Brain para tu equipo."
        actions={
          <Link href="/portal/brain" className={pBtnGhost}>
            <span className="material-icons text-base">arrow_back</span>Atrás</Link>
        }
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <span className="material-icons text-base">check_circle</span>
          Guardado.
        </div>
      )}

      {/* Enable / disable */}
      <Section title="Estado" icon="power_settings_new">
        <Row
          label="Company Brain activado"
          help="Desactívalo para ocultar Brain de la barra lateral y pausar el procesamiento."
          labelId="brain-enabled-label"
        >
          <Toggle
            checked={profile.enabled}
            onChange={(v) => save({ enabled: v })}
            disabled={saving}
            labelId="brain-enabled-label"
          />
        </Row>
      </Section>

      {/* Identity */}
      <Section title="Identidad" icon="badge">
        <Row label="Nombre visible" help="Se muestra en la parte superior del panel de Brain." htmlFor="brain-display-name">
          <NameField
            id="brain-display-name"
            value={profile.name}
            onSave={(v) => save({ name: v })}
            disabled={saving}
          />
        </Row>
      </Section>

      {/* Inbound email gateway. The token in the alias both identifies this
          tenant and authorizes the ingest — anyone with the address can drop
          mail into the brain. Treat it like a shared secret. */}
      {profile.emailIngestToken && (
        <Section title="Correo entrante" icon="mark_email_read">
          <p className="text-xs text-muted-foreground mb-3">
            Reenvía o pon en CCO cualquier correo a la dirección de abajo para añadirlo como comunicación en tu Brain.
            Los archivos adjuntos se almacenan automáticamente.
          </p>
          <Row label="Dirección de correo del Brain">
            <EmailIngestField token={profile.emailIngestToken} />
          </Row>
          <Row
            label="Procesar automáticamente al recibir"
            help="Ejecuta automáticamente todo el pipeline de IA (análisis de adjuntos, vistas previas de enlaces, resumen de transcripción) cuando llega un correo. Desactivado por defecto — las comunicaciones permanecen en Borrador hasta que hagas clic en Procesar."
            labelId="auto-process-email-label"
          >
            <Toggle
              checked={profile.autoProcessEmail}
              onChange={(v) => save({ autoProcessEmail: v })}
              disabled={saving}
              labelId="auto-process-email-label"
            />
          </Row>
          <Row
            label="Vinculación automática con el CRM"
            help="Cuando se procesa un correo, además: da de alta al remitente como contacto del CRM, vincula el correo a una empresa del CRM cuando el dominio coincide de forma inequívoca, y propone la clasificación de contactos, vínculos con oportunidades y elementos de acción con conocimiento del cerebro en la cola de revisión. Requiere Procesar automáticamente al recibir."
            labelId="auto-link-crm-label"
          >
            <Toggle
              checked={profile.autoLinkCrm}
              onChange={(v) => save({ autoLinkCrm: v })}
              disabled={saving || !profile.autoProcessEmail}
              labelId="auto-link-crm-label"
            />
          </Row>
        </Section>
      )}

      {/* Industry template */}
      <Section title="Plantilla del sector" icon="apartment">
        <p className="text-xs text-muted-foreground mb-3">
          Define los tipos de relación, las líneas de servicio y los valores de cumplimiento por defecto. Cambiar de plantilla no sobrescribe las líneas de servicio personalizadas.
        </p>
        <div className="grid gap-2">
          {availableTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => save({ industryTemplate: t.id })}
              disabled={saving || profile.industryTemplate === t.id}
              className={`text-left rounded-xl border p-3 transition-colors ${
                profile.industryTemplate === t.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{t.label}</span>
                {profile.industryTemplate === t.id && (
                  <span className="material-icons text-base text-primary">check_circle</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            </button>
          ))}
        </div>
        {template && (
          <div className="mt-3 text-xs text-muted-foreground">
            <strong>Tipos de relación:</strong> {template.relationshipTypes.map(r => r.label).join(', ') || '—'}
          </div>
        )}
      </Section>

      {/* Confidentiality */}
      <Section title="Confidencialidad por defecto" icon="lock">
        <p className="text-xs text-muted-foreground mb-3">
          Las comunicaciones, notas y documentos nuevos heredan este nivel de confidencialidad por defecto.
        </p>
        <div className="grid gap-2">
          {CONFIDENTIALITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => save({ defaultConfidentiality: opt.id })}
              disabled={saving || profile.defaultConfidentiality === opt.id}
              className={`text-left rounded-xl border p-3 transition-colors ${
                profile.defaultConfidentiality === opt.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                {profile.defaultConfidentiality === opt.id && (
                  <span className="material-icons text-base text-primary">check_circle</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.help}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Modules */}
      <Section title="Módulos activados" icon="extension">
        <p className="text-xs text-muted-foreground mb-3">
          Activa o desactiva qué módulos del Brain están disponibles. Los módulos desactivados no aparecen en la navegación.
        </p>
        <div className="space-y-2">
          {MODULE_OPTIONS.map((m) => (
            <Row key={m.id} label={m.label} help={m.help} labelId={`module-${m.id}-label`}>
              <Toggle
                checked={modules[m.id]}
                onChange={(v) => save({ enabledModules: { [m.id]: v } })}
                disabled={saving}
                labelId={`module-${m.id}-label`}
              />
            </Row>
          ))}
        </div>
      </Section>

      {/* Service lines */}
      <Section title="Líneas de servicio" icon="category">
        <p className="text-xs text-muted-foreground mb-3">
          Se usan para categorizar relaciones y prospectos. Una por línea.
        </p>
        <ServiceLinesField
          value={profile.serviceLines}
          onSave={(v) => save({ serviceLines: v })}
          disabled={saving}
        />
      </Section>

      {/* Retention policy. Anchor `retention` is linked from the trash banner
          in components/brain/NoteListPane.tsx — keep the id stable. */}
      <Section title="Política de retención" icon="schedule">
        <div id="retention" className="scroll-mt-24 space-y-3 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Notas en la papelera</strong> — eliminar una
            nota desde el IDE de conocimiento la mueve a la papelera. Las notas en la papelera siguen siendo
            recuperables hasta que hagas clic en <strong className="text-foreground">Vaciar papelera</strong> en la pestaña de la papelera. Hoy no hay purga automática.
          </p>
          <p>
            Las notas que llevan en la papelera más de{' '}
            <strong className="text-foreground">90 días</strong> se purgan automáticamente
            mediante un proceso en segundo plano diario. Aún puedes vaciar la papelera
            manualmente en cualquier momento para recuperar antes el almacenamiento de adjuntos.
          </p>
          <p>
            <strong className="text-foreground">Al vaciar la papelera se elimina:</strong>{' '}
            la fila de la nota, su archivo adjunto en el almacenamiento de objetos, los valores
            de campos personalizados asociados, los backlinks wiki entrantes y el historial de
            auditoría de la nota. Se conserva una única entrada de auditoría a nivel de tenant{' '}
            <code className="px-1 rounded bg-muted">trash_emptied</code>.
          </p>
          <p className="italic">
            Las notas activas (no enviadas a la papelera) nunca se eliminan automáticamente.
          </p>
        </div>
        {/*
          Auto-purge of trashed notes >90 days old runs daily via the cron at
          app/api/cron/brain-empty-old-trash/route.ts (registered in
          vercel.json). The per-note `auto_purged` audit row is what users see
          in the audit feed when this fires.
        */}
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground flex items-center gap-2 mb-4">
        <span className="material-icons text-base text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

// A Row labels two different kinds of control, and they need different
// mechanisms — dropping either one silently unlabels half this page.
// Native inputs take `htmlFor`, which yields a real <label> and enlarges the
// click target. Toggles are <button role="switch">, which <label for> cannot
// target at all, so they are named by `aria-labelledby` pointing at `labelId`.
function Row({
  label,
  help,
  htmlFor,
  labelId,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  labelId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} id={labelId} className="block text-sm font-medium text-foreground">{label}</label>
        ) : (
          <div id={labelId} className="text-sm font-medium text-foreground">{label}</div>
        )}
        {help && <p className="text-xs text-muted-foreground mt-0.5">{help}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled, labelId }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; labelId?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-border'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function NameField({
  value,
  onSave,
  disabled,
  id,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft.trim() !== value && draft.trim().length > 0;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
      />
      <button
        onClick={() => dirty && onSave(draft.trim())}
        disabled={disabled || !dirty}
        className={pBtnPrimary}
      >Guardar</button>
    </div>
  );
}

function EmailIngestField({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const address = `brain+${token}@simplerdevelopment.com`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <code className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded border border-border text-foreground truncate">
        {address}
      </code>
      <button
        type="button"
        onClick={copy}
        className={`${pBtnGhost} shrink-0`}
      >
        <span className="material-icons text-sm">{copied ? 'check' : 'content_copy'}</span>
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function ServiceLinesField({ value, onSave, disabled }: { value: string[]; onSave: (v: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value.join('\n'));
  useEffect(() => setDraft(value.join('\n')), [value]);
  const parsed = draft.split('\n').map(s => s.trim()).filter(Boolean);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(value);
  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        rows={Math.max(4, parsed.length + 1)}
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
        placeholder="p. ej. Inversiones y planificación"
      />
      <button
        onClick={() => dirty && onSave(parsed)}
        disabled={disabled || !dirty}
        className={pBtnPrimary}
      >
        Guardar líneas de servicio
      </button>
    </div>
  );
}
