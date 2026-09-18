// Messaging tab: company identity, brand voice, key messaging, company details, social proof, additional context.

'use client';

import { useState } from 'react';
import { INPUT_CLASS, LABEL_CLASS, type MessagingData } from '../_lib/types';

interface Props {
  messaging: MessagingData;
  updateMessaging: (field: string, value: unknown) => void;
  openRewrite: (field: string, label: string) => void;
}

export function MessagingTab({ messaging, updateMessaging, openRewrite }: Props) {
  const [newDifferentiator, setNewDifferentiator] = useState('');

  const addDifferentiator = () => {
    const val = newDifferentiator.trim();
    if (!val) return;
    updateMessaging('keyDifferentiators', [...messaging.keyDifferentiators, val]);
    setNewDifferentiator('');
  };

  const removeDifferentiator = (index: number) => {
    updateMessaging(
      'keyDifferentiators',
      messaging.keyDifferentiators.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <span className="material-icons text-base">chat</span>
          Mensajería
        </h2>
        <p className="text-sm text-muted-foreground">
          Mensajería corporativa usada en propuestas, presentaciones y contenido generado por IA para este perfil de marca.
        </p>
      </div>

      {/* Company Identity */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">business</span>
          Identidad de la empresa
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Nombre de la empresa</label>
            <input
              type="text"
              value={messaging.companyName}
              onChange={(e) => updateMessaging('companyName', e.target.value)}
              placeholder="Acme Corp"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Eslogan</label>
            <input
              type="text"
              value={messaging.tagline}
              onChange={(e) => updateMessaging('tagline', e.target.value)}
              placeholder="Construyendo el futuro, hoy"
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <FieldWithRewrite
          field="missionStatement"
          label="Declaración de misión"
          value={messaging.missionStatement}
          onChange={(v) => updateMessaging('missionStatement', v)}
          openRewrite={openRewrite}
          placeholder="¿Cuál es la misión de tu empresa?"
        />
        <FieldWithRewrite
          field="visionStatement"
          label="Declaración de visión"
          value={messaging.visionStatement}
          onChange={(v) => updateMessaging('visionStatement', v)}
          openRewrite={openRewrite}
          placeholder="¿Cuál es tu visión a largo plazo?"
        />
        <FieldWithRewrite
          field="valueProposition"
          label="Propuesta de valor"
          value={messaging.valueProposition}
          onChange={(v) => updateMessaging('valueProposition', v)}
          openRewrite={openRewrite}
          placeholder="¿Qué valor único ofreces a tus clientes?"
        />
      </div>

      {/* Brand Voice */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">record_voice_over</span>
          Voz de marca
        </h3>
        <div>
          <label className={LABEL_CLASS}>Tono de voz</label>
          <input
            type="text"
            value={messaging.toneOfVoice}
            onChange={(e) => updateMessaging('toneOfVoice', e.target.value)}
            placeholder="p. ej. Profesional, Cercano, Innovador"
            className={INPUT_CLASS}
          />
        </div>
        <FieldWithRewrite
          field="brandPersonality"
          label="Personalidad de marca"
          value={messaging.brandPersonality}
          onChange={(v) => updateMessaging('brandPersonality', v)}
          openRewrite={openRewrite}
          placeholder="Describe cómo debe percibirse tu marca en las comunicaciones"
        />
        <FieldWithRewrite
          field="writingStyle"
          label="Directrices de estilo de escritura"
          value={messaging.writingStyle}
          onChange={(v) => updateMessaging('writingStyle', v)}
          openRewrite={openRewrite}
          placeholder="Idioma, formato y estilo de comunicación preferidos"
        />

        {/* Tone Axes — structured signal that AI can reason about */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <label className={`${LABEL_CLASS} mb-0`}>Ejes de tono</label>
            <span className="text-[10px] text-muted-foreground">
              Arrastra hacia un lado: alimenta la generación de textos con IA
            </span>
          </div>
          <div className="space-y-3">
            {[
              { key: 'formal' as const, low: 'Informal', high: 'Formal' },
              { key: 'playful' as const, low: 'Serio', high: 'Juguetón' },
              { key: 'traditional' as const, low: 'Innovador', high: 'Tradicional' },
              { key: 'authoritative' as const, low: 'Cercano', high: 'Con autoridad' },
            ].map(({ key, low, high }) => {
              const value = messaging.toneAxes[key] ?? 0;
              return (
                <div key={key} data-testid={`tone-axis-${key}`}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">{low}</span>
                    <span className="text-foreground font-medium">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                    <span className="text-muted-foreground">{high}</span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={value}
                    onChange={(e) =>
                      updateMessaging('toneAxes', { ...messaging.toneAxes, [key]: parseFloat(e.target.value) })
                    }
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/70 font-mono">
                    <span>−1</span>
                    <span className={value === 0 ? 'text-muted-foreground' : 'text-primary'}>
                      {value > 0 ? '+' : ''}
                      {value.toFixed(1)}
                    </span>
                    <span>+1</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Voice Samples — short exemplars used as style anchors for AI */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <label className={`${LABEL_CLASS} mb-0`}>Ejemplos de voz</label>
            <span className="text-[10px] text-muted-foreground">3–5 ejemplos anclan a la IA en tu voz real</span>
          </div>
          <div className="space-y-2" data-testid="voice-samples-list">
            {messaging.voiceSamples.map((sample, idx) => (
              <div key={idx} className="flex gap-2 items-start" data-testid={`voice-sample-${idx}`}>
                <input
                  type="text"
                  value={sample.context}
                  onChange={(e) => {
                    const next = [...messaging.voiceSamples];
                    next[idx] = { ...next[idx], context: e.target.value };
                    updateMessaging('voiceSamples', next);
                  }}
                  placeholder="Contexto (p. ej. tuit, asunto de correo)"
                  className={`${INPUT_CLASS} w-44 flex-shrink-0`}
                />
                <textarea
                  value={sample.text}
                  onChange={(e) => {
                    const next = [...messaging.voiceSamples];
                    next[idx] = { ...next[idx], text: e.target.value };
                    updateMessaging('voiceSamples', next);
                  }}
                  placeholder="Texto de ejemplo escrito con la voz de tu marca"
                  rows={2}
                  className={`${INPUT_CLASS} flex-1 resize-y`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = messaging.voiceSamples.filter((_, i) => i !== idx);
                    updateMessaging('voiceSamples', next);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Eliminar ejemplo"
                  data-testid={`voice-sample-remove-${idx}`}
                >
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateMessaging('voiceSamples', [...messaging.voiceSamples, { context: '', text: '' }])}
              className="text-xs text-primary hover:underline flex items-center gap-1"
              data-testid="voice-sample-add"
            >
              <span className="material-icons text-sm">add</span>
              Añadir ejemplo
            </button>
          </div>
        </div>
      </div>

      {/* Key Messaging */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">campaign</span>
          Mensajes clave
        </h3>
        <FieldWithRewrite
          field="elevatorPitch"
          label="Presentación rápida"
          value={messaging.elevatorPitch}
          onChange={(v) => updateMessaging('elevatorPitch', v)}
          openRewrite={openRewrite}
          placeholder="Un mensaje breve de 30 segundos sobre tu empresa"
        />
        <FieldWithRewrite
          field="boilerplate"
          label="Descripción estándar"
          value={messaging.boilerplate}
          onChange={(v) => updateMessaging('boilerplate', v)}
          openRewrite={openRewrite}
          placeholder="Descripción estándar de la empresa para notas de prensa, propuestas, etc."
        />
        <div>
          <label className={LABEL_CLASS}>Diferenciadores clave</label>
          <div className="space-y-2">
            {messaging.keyDifferentiators.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm">
                  {item}
                </span>
                <button
                  onClick={() => removeDifferentiator(i)}
                  className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                >
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDifferentiator}
                onChange={(e) => setNewDifferentiator(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDifferentiator()}
                placeholder="Añadir un diferenciador"
                className={INPUT_CLASS}
              />
              <button
                onClick={addDifferentiator}
                disabled={!newDifferentiator.trim()}
                className="px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="material-icons text-base">add</span>
              </button>
            </div>
          </div>
        </div>
        <FieldWithRewrite
          field="targetAudience"
          label="Público objetivo"
          value={messaging.targetAudience}
          onChange={(v) => updateMessaging('targetAudience', v)}
          openRewrite={openRewrite}
          placeholder="¿Quiénes son tus clientes ideales? Demografía, necesidades, puntos de dolor"
        />
      </div>

      {/* Company Details */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">info</span>
          Detalles de la empresa
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Sector</label>
            <input
              type="text"
              value={messaging.industry}
              onChange={(e) => updateMessaging('industry', e.target.value)}
              placeholder="p. ej. SaaS, Sanidad, Fintech"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Año de fundación</label>
            <input
              type="text"
              value={messaging.yearFounded}
              onChange={(e) => updateMessaging('yearFounded', e.target.value)}
              placeholder="p. ej. 2020"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Tamaño de la empresa</label>
            <input
              type="text"
              value={messaging.companySize}
              onChange={(e) => updateMessaging('companySize', e.target.value)}
              placeholder="p. ej. 50-100 empleados"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Sede</label>
            <input
              type="text"
              value={messaging.headquarters}
              onChange={(e) => updateMessaging('headquarters', e.target.value)}
              placeholder="Ciudad, estado / país"
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>URL del sitio web</label>
          <input
            type="text"
            value={messaging.websiteUrl}
            onChange={(e) => updateMessaging('websiteUrl', e.target.value)}
            placeholder="https://example.com"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {/* Social Proof */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">verified</span>
          Prueba social
        </h3>
        <FieldWithRewrite
          field="socialProof"
          label="Testimonios, premios y prensa"
          value={messaging.socialProof}
          onChange={(v) => updateMessaging('socialProof', v)}
          openRewrite={openRewrite}
          placeholder="Testimonios, premios o menciones en prensa destacados"
        />
        <FieldWithRewrite
          field="keyClients"
          label="Clientes / socios clave"
          value={messaging.keyClients}
          onChange={(v) => updateMessaging('keyClients', v)}
          openRewrite={openRewrite}
          placeholder="Clientes o socios destacados que puedes mencionar"
        />
        <FieldWithRewrite
          field="certifications"
          label="Certificaciones y acreditaciones"
          value={messaging.certifications}
          onChange={(v) => updateMessaging('certifications', v)}
          openRewrite={openRewrite}
          placeholder="Certificaciones del sector, estándares de cumplimiento, etc."
        />
      </div>

      {/* Additional Context */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-primary">lightbulb</span>
          Contexto adicional
        </h3>
        <FieldWithRewrite
          field="additionalContext"
          label="Algo más que la IA deba saber"
          value={messaging.additionalContext}
          onChange={(v) => updateMessaging('additionalContext', v)}
          openRewrite={openRewrite}
          placeholder="Cualquier otra información útil al generar propuestas, presentaciones u otro contenido"
          minHeight="min-h-[120px]"
        />
      </div>
    </div>
  );
}

interface FieldWithRewriteProps {
  field: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  openRewrite: (field: string, label: string) => void;
  placeholder: string;
  minHeight?: string;
}

function FieldWithRewrite({
  field,
  label,
  value,
  onChange,
  openRewrite,
  placeholder,
  minHeight = 'min-h-[80px]',
}: FieldWithRewriteProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={`${LABEL_CLASS} mb-0`}>{label}</label>
        <button
          type="button"
          onClick={() => openRewrite(field, label)}
          className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors"
          title="Reescribir con IA"
        >
          <span className="material-icons text-sm">auto_awesome</span>
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${minHeight} resize-y`}
      />
    </div>
  );
}
