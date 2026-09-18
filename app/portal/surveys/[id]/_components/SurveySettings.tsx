'use client';

import NotifyDeliveryFields from './NotifyDeliveryFields';

/**
 * SurveySettings — appearance, completion, and response settings tab.
 *
 * Lifted verbatim from page.tsx. Renders the branding/colors/fonts/buttons
 * editor, the completion screen settings, and the response-rules block.
 * The Save handler is owned by the page (handed in via onSave) so the page
 * still controls the PUT payload shape.
 */

import { useEffect, useState } from 'react';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import type { BrandingProfile } from '../_lib/api';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import type { SurveyScoringConfig } from '@/lib/db/schema';

// SCORE-02: pipeline + stage list shape returned by /api/portal/crm/pipelines.
// The route already eager-loads stages alongside each pipeline so a single
// fetch covers both the pipeline-select and stage-select.
interface CrmPipelineSummary {
  id: number;
  name: string;
  stages: { id: number; name: string; sortOrder: number }[];
}

interface Props {
  saving: boolean;
  brandingProfiles: BrandingProfile[];

  editColor: string;
  editBrandingProfileId: number | null;
  setEditBrandingProfileId: (id: number | null) => void;

  editStyling: Record<string, string | boolean | undefined>;
  setEditStyling: (
    next:
      | Record<string, string | boolean | undefined>
      | ((prev: Record<string, string | boolean | undefined>) => Record<string, string | boolean | undefined>),
  ) => void;

  editThankYouTitle: string;
  setEditThankYouTitle: (v: string) => void;
  editThankYouMessage: string;
  setEditThankYouMessage: (v: string) => void;
  editRedirectUrl: string;
  setEditRedirectUrl: (v: string) => void;

  editRequireEmail: boolean;
  setEditRequireEmail: (v: boolean) => void;
  editAllowMultiple: boolean;
  setEditAllowMultiple: (v: boolean) => void;
  editPublishResults: boolean;
  setEditPublishResults: (v: boolean) => void;
  editCertificateEnabled: boolean;
  setEditCertificateEnabled: (v: boolean) => void;
  editNotify: boolean;
  setEditNotify: (v: boolean) => void;
  editDigest: string;
  editNotifyUserIds: number[];
  setEditNotifyUserIds: (v: number[]) => void;
  teamMembers: { userId: number; name: string | null; email: string | null }[];
  setEditDigest: (v: string) => void;
  editClosesAt: string;
  setEditClosesAt: (v: string) => void;
  editMaxResponses: string;
  setEditMaxResponses: (v: string) => void;

  // editFields powers both DIST-02 (consent field dropdown) and SCORE-02 (auto-
  // route panel visibility — only shown when at least one field has scoring).
  editFields: SurveyField[];

  // SCORE-02: survey-level scoring config (auto-route-to-CRM). State is always
  // threaded so save() can clear stale configs when no field is scored.
  editScoringConfig: SurveyScoringConfig | null;
  setEditScoringConfig: (v: SurveyScoringConfig | null) => void;

  // DIST-02: opt-in gate field for follow-up email sequences. `null` means
  // "email presence is enough" (back-compat for surveys created before the
  // column existed).
  editConsentField: string | null;
  setEditConsentField: (v: string | null) => void;

  onSave: () => void;
  onDelete: () => void;
}

export default function SurveySettings(props: Props) {
  const {
    saving,
    brandingProfiles,
    editColor,
    editBrandingProfileId,
    setEditBrandingProfileId,
    editStyling,
    setEditStyling,
    editThankYouTitle,
    setEditThankYouTitle,
    editThankYouMessage,
    setEditThankYouMessage,
    editRedirectUrl,
    setEditRedirectUrl,
    editRequireEmail,
    setEditRequireEmail,
    editAllowMultiple,
    setEditAllowMultiple,
    editPublishResults,
    setEditPublishResults,
    editCertificateEnabled,
    setEditCertificateEnabled,
    editNotify,
    setEditNotify,
    editDigest,
    editNotifyUserIds,
    setEditNotifyUserIds,
    teamMembers,
    setEditDigest,
    editClosesAt,
    setEditClosesAt,
    editMaxResponses,
    setEditMaxResponses,
    editFields,
    editScoringConfig,
    setEditScoringConfig,
    editConsentField,
    setEditConsentField,
    onSave,
    onDelete,
  } = props;

  // SCORE-02: surface the auto-route panel only when the survey is "scorable"
  // — i.e. at least one field has a scoring rule. Saves users from setting up
  // a threshold against a survey that will always score 0.
  const hasAnyScoredField = (editFields || []).some((f) => !!f.scoring);

  const [pipelines, setPipelines] = useState<CrmPipelineSummary[]>([]);
  const [pipelinesLoaded, setPipelinesLoaded] = useState(false);

  // Lazy-load pipelines only once, only when the panel is actually visible.
  // The list endpoint also seeds a default pipeline on first call, so we want
  // to avoid hitting it for surveys that will never use auto-route.
  useEffect(() => {
    if (!hasAnyScoredField || pipelinesLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/portal/crm/pipelines');
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data.data)) {
          setPipelines(data.data as CrmPipelineSummary[]);
        }
      } catch {
        // Swallow — the panel just renders empty selects.
      } finally {
        if (!cancelled) setPipelinesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAnyScoredField, pipelinesLoaded]);

  const autoRoute = editScoringConfig?.autoRouteToCrm;
  const selectedPipeline = pipelines.find((p) => p.id === autoRoute?.pipelineId);

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">palette</span>
          Apariencia
        </h3>

        {/* Branding Profile */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Perfil de marca</label>
          <select
            value={editBrandingProfileId || ''}
            onChange={(e) => setEditBrandingProfileId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            <option value="">Ninguna (usa las anulaciones de abajo)</option>
            {brandingProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? ' (predeterminado)' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Selecciona un perfil de marca como base y luego sobrescribe los valores individuales a continuación.
            {brandingProfiles.length === 0 && (
              <>
                {' '}
                <a href="/portal/branding" className="text-primary hover:underline">
                  Crear un perfil de marca
                </a>{' '}
                primero.
              </>
            )}
          </p>
        </div>

        {/* Colors */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">color_lens</span>
            Colores
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(
              [
                { key: 'primaryColor', label: 'Principal', fallback: editColor || '#2563eb' },
                { key: 'secondaryColor', label: 'Secundario', fallback: '#1e40af' },
                { key: 'accentColor', label: 'Acento', fallback: '#f59e0b' },
                { key: 'backgroundColor', label: 'Fondo', fallback: '#ffffff' },
                { key: 'textColor', label: 'Texto', fallback: '#111827' },
                { key: 'formBg', label: 'Tarjeta del formulario', fallback: '#ffffff' },
                { key: 'inputBg', label: 'Campos de entrada', fallback: '#ffffff' },
                { key: 'inputTextColor', label: 'Texto de entrada', fallback: '#111827' },
                { key: 'inputOptionTextColor', label: 'Texto de opciones', fallback: '#374151' },
              ] as const
            ).map(({ key, label, fallback }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(editStyling[key] as string) || fallback}
                    onChange={(e) => setEditStyling((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    value={(editStyling[key] as string) || ''}
                    onChange={(e) => setEditStyling((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={fallback}
                    className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fonts */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">text_fields</span>
            Fuentes
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Fuente de títulos</label>
              <GoogleFontPicker
                value={(editStyling.headingFont as string) || ''}
                onChange={(font) => setEditStyling((prev) => ({ ...prev, headingFont: font }))}
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Fuente del cuerpo</label>
              <GoogleFontPicker
                value={(editStyling.bodyFont as string) || ''}
                onChange={(font) => setEditStyling((prev) => ({ ...prev, bodyFont: font }))}
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">smart_button</span>
            Botones
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Fondo del botón</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(editStyling.buttonPrimaryBg as string) || editColor || '#2563eb'}
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                  className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={(editStyling.buttonPrimaryBg as string) || ''}
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryBg: e.target.value }))}
                  placeholder="Automático"
                  className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Texto del botón</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(editStyling.buttonPrimaryText as string) || '#ffffff'}
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryText: e.target.value }))}
                  className="w-8 h-8 rounded border border-border cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={(editStyling.buttonPrimaryText as string) || ''}
                  onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonPrimaryText: e.target.value }))}
                  placeholder="#ffffff"
                  className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Radio del borde</label>
              <select
                value={(editStyling.buttonBorderRadius as string) || ''}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, buttonBorderRadius: e.target.value }))}
                className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Predeterminado</option>
                <option value="0px">Cuadrado (0px)</option>
                <option value="4px">Ligero (4px)</option>
                <option value="8px">Redondeado (8px)</option>
                <option value="12px">Más redondeado (12px)</option>
                <option value="9999px">Pastilla (completo)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Layout */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">view_quilt</span>Diseño</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Radio del borde de la tarjeta</label>
              <select
                value={(editStyling.borderRadius as string) || ''}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, borderRadius: e.target.value }))}
                className="w-full px-2 py-1 text-xs bg-background border border-border rounded text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Predeterminado (8px)</option>
                <option value="0px">Cuadrado (0px)</option>
                <option value="4px">Ligero (4px)</option>
                <option value="12px">Redondeado (12px)</option>
                <option value="16px">Más redondeado (16px)</option>
                <option value="24px">Muy redondeado (24px)</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6 mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!editStyling.hideTitle}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, hideTitle: e.target.checked }))}
                className="rounded border-border accent-primary"
              />
              <span className="text-sm text-foreground">Ocultar título en la página pública</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!editStyling.hideLogo}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, hideLogo: e.target.checked }))}
                className="rounded border-border accent-primary"
              />
              <span className="text-sm text-foreground">Ocultar logotipo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!editStyling.darkMode}
                onChange={(e) => setEditStyling((prev) => ({ ...prev, darkMode: e.target.checked }))}
                className="rounded border-border accent-primary"
              />
              <span className="text-sm text-foreground">Activar modo oscuro</span>
            </label>
          </div>
        </div>

        {/* Preview */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Vista previa</h4>
          <div
            className="rounded-xl border p-6 flex items-center justify-center"
            style={{
              backgroundColor: (editStyling.backgroundColor as string) || '#ffffff',
              borderColor: ((editStyling.textColor as string) || '#111827') + '20',
              borderRadius: (editStyling.borderRadius as string) || '8px',
            }}
          >
            <div
              className="rounded-lg border p-4 w-full max-w-xs space-y-3"
              style={{
                backgroundColor: (editStyling.formBg as string) || '#ffffff',
                borderColor: ((editStyling.textColor as string) || '#111827') + '15',
              }}
            >
              <p
                style={{
                  fontFamily: (editStyling.headingFont as string)
                    ? `"${editStyling.headingFont}", sans-serif`
                    : undefined,
                  color: (editStyling.textColor as string) || '#111827',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                Pregunta de encuesta
              </p>
              <div
                className="rounded px-3 py-2 text-xs"
                style={{
                  backgroundColor: (editStyling.inputBg as string) || '#f3f4f6',
                  color: ((editStyling.textColor as string) || '#111827') + '80',
                }}
              >
                Tu respuesta...
              </div>
              <button
                className="w-full px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor:
                    (editStyling.buttonPrimaryBg as string) ||
                    (editStyling.primaryColor as string) ||
                    editColor ||
                    '#2563eb',
                  color: (editStyling.buttonPrimaryText as string) || '#ffffff',
                  borderRadius: (editStyling.buttonBorderRadius as string) || '8px',
                }}
              >Siguiente</button>
            </div>
          </div>
        </div>
      </div>

      {/* Completion */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">celebration</span>
          Pantalla de finalización
        </h3>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Título de agradecimiento</label>
          <input
            type="text"
            value={editThankYouTitle}
            onChange={(e) => setEditThankYouTitle(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Mensaje de agradecimiento</label>
          <textarea
            value={editThankYouMessage}
            onChange={(e) => setEditThankYouMessage(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">URL de redirección (opcional)</label>
          <input
            type="url"
            value={editRedirectUrl}
            onChange={(e) => setEditRedirectUrl(e.target.value)}
            placeholder="https://example.com/thank-you"
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Si se define, los encuestados serán redirigidos aquí en lugar de ver la pantalla de agradecimiento
          </p>
        </div>
      </div>

      {/* Response Settings */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">tune</span>
          Ajustes de respuestas
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editRequireEmail}
              onChange={(e) => setEditRequireEmail(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Solicitar el correo del encuestado</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editAllowMultiple}
              onChange={(e) => setEditAllowMultiple(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Permitir varias respuestas por persona</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editNotify}
              onChange={(e) => setEditNotify(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-foreground">Notificación por correo al recibir una respuesta</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editPublishResults}
              onChange={(e) => setEditPublishResults(e.target.checked)}
              className="rounded border-border mt-0.5"
            />
            <span className="text-sm text-foreground">
              Publicar página pública de resultados
              <span className="block text-xs text-muted-foreground">
                Gráficos agregados en <code className="px-1 py-0.5 rounded bg-muted text-[11px]">/s/&lt;slug&gt;/results</code>. No
                se exponen respuestas individuales.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editCertificateEnabled}
              onChange={(e) => setEditCertificateEnabled(e.target.checked)}
              className="rounded border-border mt-0.5"
            />
            <span className="text-sm text-foreground">
              Ofrecer certificado de finalización
              <span className="block text-xs text-muted-foreground">
                Tras enviar, los encuestados ven un botón &ldquo;Descargar certificado&rdquo; en la pantalla de agradecimiento.
                El PDF usa el perfil de marca de esta encuesta (logotipo, colores, fuentes) y muestra el nombre del encuestado
                y la fecha de finalización.
              </span>
            </span>
          </label>
        </div>
        <NotifyDeliveryFields
          editDigest={editDigest}
          setEditDigest={setEditDigest}
          editNotifyUserIds={editNotifyUserIds}
          setEditNotifyUserIds={setEditNotifyUserIds}
          teamMembers={teamMembers}
        />

        {/* DIST-02: consent-field gate for follow-up email sequences. */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">verified_user</span>
            Campo de consentimiento para correos de seguimiento
          </label>
          <select
            value={editConsentField ?? ''}
            onChange={(e) => setEditConsentField(e.target.value ? e.target.value : null)}
            className="w-full sm:w-72 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">(ninguno — basta con un correo electrónico)</option>
            {(editFields || [])
              .filter((f) => f.id && f.type !== 'heading' && f.type !== 'page_break' && f.type !== 'file')
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label || f.id}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            Las secuencias de correos de seguimiento solo se activan cuando la respuesta de este campo es verdadera
            (p. ej. una casilla o un interruptor &ldquo;Sí&rdquo;). Déjalo sin definir para enviar seguimientos a cualquiera que
            proporcione una dirección de correo electrónico.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Fecha de cierre (opcional)</label>
            <input
              type="datetime-local"
              value={editClosesAt}
              onChange={(e) => setEditClosesAt(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Máximo de respuestas (opcional)</label>
            <input
              type="number"
              value={editMaxResponses}
              onChange={(e) => setEditMaxResponses(e.target.value)}
              placeholder="Ilimitado"
              min={1}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      {/* SCORE-02: auto-route scored responses to a CRM deal. Hidden until at
          least one field has a scoring rule — otherwise the threshold could
          never fire. */}
      {hasAnyScoredField && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-2">
            <span className="material-icons text-primary">forward_to_inbox</span>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">Enrutar automáticamente al CRM</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cuando la puntuación de una respuesta supera tu umbral (y se captura un correo electrónico), se crea
                automáticamente un trato en el pipeline de CRM elegido.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!autoRoute?.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                const current = editScoringConfig?.autoRouteToCrm;
                setEditScoringConfig({
                  ...editScoringConfig,
                  autoRouteToCrm: {
                    enabled,
                    minScore: current?.minScore ?? 0,
                    pipelineId: current?.pipelineId ?? 0,
                    stageId: current?.stageId ?? 0,
                    dealTitleTemplate: current?.dealTitleTemplate ?? 'Lead de encuesta: {surveyTitle}',
                  },
                });
              }}
              className="rounded border-border mt-0.5"
            />
            <span className="text-sm text-foreground">
              Activar enrutamiento automático
              <span className="block text-xs text-muted-foreground">
                De mejor esfuerzo — un error del CRM nunca hará fallar el envío público de la encuesta.
              </span>
            </span>
          </label>

          {autoRoute?.enabled && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Puntuación mínima</label>
                <input
                  type="number"
                  value={Number.isFinite(autoRoute.minScore) ? autoRoute.minScore : 0}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        minScore: Number.isFinite(n) ? n : 0,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">El trato se crea cuando la puntuación alcanza este valor.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Pipeline</label>
                <select
                  value={autoRoute.pipelineId || ''}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        pipelineId: Number.isFinite(pid) ? pid : 0,
                        // Reset stage when pipeline changes — stale stage IDs
                        // would fail the ownership check at submit time.
                        stageId: 0,
                      },
                    });
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Selecciona un pipeline…</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {pipelinesLoaded && pipelines.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No hay pipelines de CRM todavía.{' '}
                    <a href="/portal/crm/pipelines" className="text-primary hover:underline">Crea uno</a>.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Etapa</label>
                <select
                  value={autoRoute.stageId || ''}
                  onChange={(e) => {
                    const sid = Number(e.target.value);
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        stageId: Number.isFinite(sid) ? sid : 0,
                      },
                    });
                  }}
                  disabled={!selectedPipeline}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Selecciona una etapa…</option>
                  {(selectedPipeline?.stages || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Plantilla del título del trato</label>
                <input
                  type="text"
                  value={autoRoute.dealTitleTemplate ?? ''}
                  onChange={(e) => {
                    setEditScoringConfig({
                      ...editScoringConfig,
                      autoRouteToCrm: {
                        ...autoRoute,
                        dealTitleTemplate: e.target.value,
                      },
                    });
                  }}
                  placeholder="Lead de encuesta: {surveyTitle}"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Admite tokens: <code>{'{surveyTitle}'}</code>, <code>{'{respondentName}'}</code>,{' '}
                  <code>{'{respondentEmail}'}</code>, <code>{'{score}'}</code>.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save / Delete */}
      <div className="flex items-center justify-between">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm transition-colors"
        >
          <span className="material-icons text-lg">delete</span>
          Eliminar encuesta
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="material-icons text-lg animate-spin">progress_activity</span>Guardando...</>
          ) : (
            <>
              <span className="material-icons text-lg">save</span>Guardar ajustes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
