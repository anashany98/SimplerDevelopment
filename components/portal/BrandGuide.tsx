'use client';

import { createElement, useMemo, useState } from 'react';
import Link from 'next/link';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import { Button } from '@/components/ui/Button';
import { BrandingProvider } from '@/contexts/BrandingContext';
import type { Block } from '@/types/blocks';
import type { ResolvedBranding } from '@/lib/branding';
import type { BrandMessagingContext, ToneAxes } from '@/lib/branding/block-defaults';

interface Props {
  profileId: number;
  profileName: string;
  updatedAt?: string;
  clientName?: string;
  branding: ResolvedBranding;
  messaging?: BrandMessagingContext;
  exampleBlocks: Block[];
}

export function BrandGuide({
  profileId,
  profileName,
  updatedAt,
  clientName,
  branding,
  messaging,
  exampleBlocks,
}: Props) {
  const [copied, setCopied] = useState(false);

  const company = messaging?.companyName?.trim() || clientName || profileName;
  const tagline = messaging?.tagline?.trim() || '';

  const exampleContent = useMemo(() => JSON.stringify({ blocks: exampleBlocks }), [exampleBlocks]);

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="min-h-screen bg-white print:bg-white">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 print:hidden flex items-center justify-between px-6 py-3 border-b border-border bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/portal/branding/profiles/${profileId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span className="material-icons text-base">arrow_back</span>
            Volver al editor
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900 truncate">{profileName}</span>
          <span className="text-xs text-gray-500">guía de marca</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyShareLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span className="material-icons text-sm">{copied ? 'check' : 'link'}</span>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition-colors"
          >
            <span className="material-icons text-sm">print</span>
            Imprimir / PDF
          </button>
        </div>
      </div>

      <BrandingProvider branding={branding}>
        <article className="max-w-5xl mx-auto px-8 sm:px-12 py-16 space-y-24 text-gray-900 print:py-8 print:space-y-14">
          <CoverSection
            company={company}
            tagline={tagline}
            profileName={profileName}
            updatedAt={updatedAt}
            logoUrl={branding.logoRectUrl || branding.logoUrl}
          />

          <LogoSection branding={branding} />

          <ColorsSection branding={branding} />

          <TypographySection branding={branding} sample={tagline || company} />

          <ButtonsSection />

          <VoiceSection messaging={messaging} />

          <ApplicationSection content={exampleContent} branding={branding} />

          <GuideFooter clientName={clientName} profileName={profileName} />
        </article>
      </BrandingProvider>
    </div>
  );
}

/* ─────────────────────────  Sections  ───────────────────────── */

function SectionHeader({ number, label, title, description }: { number: string; label: string; title: string; description?: string }) {
  return (
    <header className="mb-10">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-xs font-mono text-gray-400">{number}</span>
        <span className="text-xs font-semibold tracking-[0.25em] uppercase text-gray-500">{label}</span>
      </div>
      <h2 className="text-4xl font-bold tracking-tight">{title}</h2>
      {description && <p className="mt-3 text-base text-gray-600 max-w-2xl">{description}</p>}
    </header>
  );
}

function CoverSection({
  company,
  tagline,
  profileName,
  updatedAt,
  logoUrl,
}: {
  company: string;
  tagline: string;
  profileName: string;
  updatedAt?: string;
  logoUrl?: string;
}) {
  const formattedDate = updatedAt ? new Date(updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  return (
    <section className="pt-8 border-b border-gray-200 pb-16 print:pt-0">
      <div className="text-xs font-semibold tracking-[0.3em] uppercase text-gray-500 mb-8">Guía de marca</div>
      {logoUrl && (
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={company} className="h-16 w-auto object-contain" />
        </div>
      )}
      <h1 className="text-6xl sm:text-7xl font-bold tracking-tight leading-[0.95]">{company}</h1>
      {tagline && <p className="mt-6 text-2xl text-gray-600 max-w-3xl">{tagline}</p>}
      <dl className="mt-12 flex flex-wrap gap-x-10 gap-y-4 text-sm text-gray-500">
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400">Perfil</dt>
          <dd className="mt-1 text-gray-900 font-medium">{profileName}</dd>
        </div>
        {formattedDate && (
          <div>
            <dt className="text-xs uppercase tracking-wider text-gray-400">Última actualización</dt>
            <dd className="mt-1 text-gray-900 font-medium">{formattedDate}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function LogoSection({ branding }: { branding: ResolvedBranding }) {
  const variants = [
    { label: 'Principal', url: branding.logoRectUrl || branding.logoUrl, usage: 'Predeterminado — cabeceras, pies de página, documentos' },
    { label: 'Cuadrado', url: branding.logoSquareUrl, usage: 'Avatares, iconos de app, perfiles sociales' },
    { label: 'Icono', url: branding.logoIconUrl, usage: 'Favicons, superficies de formato pequeño' },
  ].filter((v) => !!v.url);

  if (variants.length === 0 && !branding.logoText) {
    return (
      <section>
        <SectionHeader number="01" label="Logo" title="Logo" />
        <p className="text-gray-600">Aún no hay logos subidos. Añádelos en la pestaña Logos del perfil.</p>
      </section>
    );
  }

  return (
    <section className="break-inside-avoid">
      <SectionHeader
        number="01"
        label="Logo"
        title="Logo"
        description="Usa la variante que mejor encaje en el espacio disponible. Mantén un espacio libre igual a la altura de mayúscula del logo en todos los lados."
      />
      <div className="grid md:grid-cols-3 gap-6">
        {variants.map((v) => (
          <div key={v.label} className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] flex items-center justify-center bg-gray-50 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.url} alt={`${v.label} logo`} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="p-4 border-t border-gray-200">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{v.label}</div>
              <div className="text-sm text-gray-700 mt-1">{v.usage}</div>
            </div>
          </div>
        ))}
      </div>

      {branding.logoText && (
        <div className="mt-6 border border-gray-200 rounded-xl p-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Logotipo</div>
          <div
            className="text-5xl font-bold"
            style={{
              fontFamily: branding.typography?.logoText?.font
                ? `"${branding.typography.logoText.font}", sans-serif`
                : 'var(--brand-heading-font, sans-serif)',
            }}
          >
            {branding.logoText}
          </div>
          <div className="text-sm text-gray-600 mt-3">Logotipo tipográfico: úsalo cuando no haya un logo de imagen disponible.</div>
        </div>
      )}

      {variants[0]?.url && (
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <LogoBgSwatch label="Sobre claro" bg="#ffffff" url={variants[0].url} />
          <LogoBgSwatch label="Sobre oscuro" bg={branding.textColor} url={variants[0].url} />
          <LogoBgSwatch label="Sobre primario" bg={branding.primaryColor} url={variants[0].url} />
        </div>
      )}
    </section>
  );
}

function LogoBgSwatch({ label, bg, url }: { label: string; bg: string; url: string }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="aspect-[2/1] flex items-center justify-center p-6" style={{ backgroundColor: bg }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="px-4 py-2 text-xs text-gray-600 bg-white border-t border-gray-200">{label}</div>
    </div>
  );
}

function ColorsSection({ branding }: { branding: ResolvedBranding }) {
  const swatches: Array<{ label: string; hex?: string; cssVar: string; role: string }> = [
    { label: 'Principal', hex: branding.primaryColor, cssVar: '--brand-primary', role: 'Acciones, enlaces, énfasis' },
    { label: 'Secundario', hex: branding.secondaryColor, cssVar: '--brand-secondary', role: 'Acentos de apoyo' },
    { label: 'Acento', hex: branding.accentColor, cssVar: '--brand-accent', role: 'Destacados, insignias' },
    { label: 'Fondo', hex: branding.backgroundColor, cssVar: '--brand-bg', role: 'Superficie de página' },
    { label: 'Texto', hex: branding.textColor, cssVar: '--brand-text', role: 'Texto del cuerpo' },
    { label: 'Fondo de navegación', hex: branding.navBackground, cssVar: '--brand-nav-bg', role: 'Superficie de navegación' },
    { label: 'Texto de navegación', hex: branding.navTextColor, cssVar: '--brand-nav-text', role: 'Etiquetas de navegación' },
    { label: 'Enlace', hex: branding.linkColor, cssVar: '--brand-link-color', role: 'Hipervínculos en línea' },
    { label: 'Enlace (hover)', hex: branding.linkHoverColor, cssVar: '--brand-link-hover-color', role: 'Estado hover del enlace' },
  ].filter((s) => !!s.hex);

  return (
    <section className="break-inside-avoid">
      <SectionHeader
        number="02"
        label="Paleta"
        title="Colores"
        description="Colores principales con sus roles y propiedades personalizadas de CSS. Referencia estas variables en el código, nunca valores hex codificados a mano."
      />
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {swatches.map((s) => (
          <ColorSwatch key={s.cssVar} {...s} />
        ))}
      </div>
    </section>
  );
}

function ColorSwatch({ label, hex, cssVar, role }: { label: string; hex?: string; cssVar: string; role: string }) {
  if (!hex) return null;
  const light = isLight(hex);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div
        className="h-28 flex items-end p-4"
        style={{ backgroundColor: hex, color: light ? '#0f172a' : '#ffffff' }}
      >
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="p-4 bg-white text-sm space-y-1">
        <div className="flex items-center justify-between">
          <code className="font-mono text-xs text-gray-900">{hex.toUpperCase()}</code>
          <code className="font-mono text-xs text-gray-500">{cssVar}</code>
        </div>
        <p className="text-xs text-gray-600">{role}</p>
      </div>
    </div>
  );
}

function TypographySection({ branding, sample }: { branding: ResolvedBranding; sample: string }) {
  const sampleText = sample || 'El veloz murciélago hindú comía feliz cardillo y kiwi';
  const headingFont = branding.headingFont || 'Predeterminada del sistema';
  const bodyFont = branding.bodyFont || 'Predeterminada del sistema';

  const scale: Array<{ tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'blockquote' | 'small'; label: string }> = [
    { tag: 'h1', label: 'H1' },
    { tag: 'h2', label: 'H2' },
    { tag: 'h3', label: 'H3' },
    { tag: 'h4', label: 'H4' },
    { tag: 'h5', label: 'H5' },
    { tag: 'h6', label: 'H6' },
    { tag: 'p', label: 'Cuerpo' },
    { tag: 'blockquote', label: 'Cita' },
    { tag: 'small', label: 'Pequeño' },
  ];

  const getMeta = (key: string) => {
    const t = branding.typography?.[key as keyof NonNullable<ResolvedBranding['typography']>];
    if (!t) return '—';
    return [t.size, t.weight ? `w${t.weight}` : null, t.lineHeight ? `lh ${t.lineHeight}` : null]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <section className="break-inside-avoid">
      <SectionHeader
        number="03"
        label="Tipografía"
        title="Sistema tipográfico"
        description="Combinación de títulos y cuerpo, y la escala tipográfica completa según la configuración."
      />

      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        <FontCard label="Fuente de títulos" name={headingFont} sample="Aa" font={headingFont} />
        <FontCard label="Fuente del cuerpo" name={bodyFont} sample="Aa" font={bodyFont} />
      </div>

      <div className="border border-gray-200 rounded-xl divide-y divide-gray-200">
        {scale.map(({ tag, label }) => (
          <div key={tag} className="grid grid-cols-[auto_1fr_auto] gap-6 items-baseline px-6 py-5">
            <span className="text-xs font-mono text-gray-400 w-10">{label}</span>
            <TypeSample tag={tag} text={sampleText} />
            <code className="text-xs font-mono text-gray-500 whitespace-nowrap">{getMeta(tag)}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function FontCard({ label, name, sample, font }: { label: string; name: string; sample: string; font: string }) {
  const fontFamily = font ? `"${font}", sans-serif` : 'sans-serif';
  return (
    <div className="border border-gray-200 rounded-xl p-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <div className="text-6xl leading-none mb-3" style={{ fontFamily }}>{sample}</div>
      <div className="text-sm text-gray-700 font-medium">{name}</div>
    </div>
  );
}

function TypeSample({ tag, text }: { tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'blockquote' | 'small'; text: string }) {
  return createElement(tag, { className: 'm-0' }, text);
}

function ButtonsSection() {
  return (
    <section className="break-inside-avoid">
      <SectionHeader
        number="04"
        label="UI"
        title="Botones"
        description="Las variantes de botón se renderizan con el estilo, el radio y la tipografía configurados."
      />
      <div className="border border-gray-200 rounded-xl p-8 space-y-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Principal</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Botón pequeño</Button>
            <Button size="md">Botón mediano</Button>
            <Button size="lg">Botón grande</Button>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Contorno</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline">Botón pequeño</Button>
            <Button size="md" variant="outline">Botón mediano</Button>
            <Button size="lg" variant="outline">Botón grande</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function VoiceSection({ messaging }: { messaging?: BrandMessagingContext }) {
  if (!messaging) {
    return (
      <section>
        <SectionHeader number="05" label="Voz" title="Voz y tono" />
        <p className="text-gray-600">No hay mensajes definidos. Añade eslogan, misión, ejes de tono y muestras de voz en la pestaña Mensajes del perfil.</p>
      </section>
    );
  }

  const axes: Array<{ key: keyof ToneAxes; left: string; right: string }> = [
    { key: 'formal', left: 'Informal', right: 'Formal' },
    { key: 'playful', left: 'Serio', right: 'Divertido' },
    { key: 'traditional', left: 'Innovador', right: 'Tradicional' },
    { key: 'authoritative', left: 'Cercano', right: 'Autoritario' },
  ];
  const hasAxes = axes.some(({ key }) => typeof messaging.toneAxes?.[key] === 'number');

  return (
    <section>
      <SectionHeader
        number="05"
        label="Voz"
        title="Voz y tono"
        description="Cómo sonamos en la página. Usa estas pautas para mantener cada punto de contacto alineado con la marca."
      />

      {messaging.tagline && (
        <blockquote className="border-l-4 pl-6 py-2 mb-10 italic text-2xl font-medium text-gray-900" style={{ borderColor: 'var(--brand-primary)' }}>
          “{messaging.tagline}”
        </blockquote>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <CopyCard label="Propuesta de valor" text={messaging.valueProposition} />
        <CopyCard label="Pitch de ascensor" text={messaging.elevatorPitch} />
        <CopyCard label="Misión" text={messaging.missionStatement} />
        <CopyCard label="Visión" text={messaging.visionStatement} />
        <CopyCard label="Público objetivo" text={messaging.targetAudience} />
        <CopyCard label="Texto corporativo" text={messaging.boilerplate} />
      </div>

      {(messaging.brandPersonality || messaging.toneOfVoice || messaging.writingStyle) && (
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          {messaging.brandPersonality && <PillCard label="Personalidad" text={messaging.brandPersonality} />}
          {messaging.toneOfVoice && <PillCard label="Tono" text={messaging.toneOfVoice} />}
          {messaging.writingStyle && <PillCard label="Estilo de escritura" text={messaging.writingStyle} />}
        </div>
      )}

      {hasAxes && (
        <div className="border border-gray-200 rounded-xl p-8 mb-10">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">Ejes de tono</div>
          <div className="space-y-6">
            {axes.map(({ key, left, right }) => {
              const val = messaging.toneAxes?.[key];
              if (typeof val !== 'number') return null;
              const pct = ((val + 1) / 2) * 100;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs text-gray-600 mb-2">
                    <span>{left}</span>
                    <span>{right}</span>
                  </div>
                  <div className="relative h-1.5 bg-gray-200 rounded-full">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
                      style={{ left: `calc(${pct}% - 6px)`, backgroundColor: 'var(--brand-primary)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {messaging.keyDifferentiators && messaging.keyDifferentiators.length > 0 && (
        <div className="mb-10">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Diferenciadores clave</div>
          <ul className="grid sm:grid-cols-2 gap-3">
            {messaging.keyDifferentiators.map((d, i) => (
              <li key={i} className="flex gap-3 items-start border border-gray-200 rounded-lg p-4">
                <span className="material-icons text-base mt-0.5" style={{ color: 'var(--brand-primary)' }}>check_circle</span>
                <span className="text-sm text-gray-900">{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {messaging.voiceSamples && messaging.voiceSamples.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Muestras de voz</div>
          <div className="space-y-4">
            {messaging.voiceSamples.map((s, i) => (
              <figure key={i} className="border border-gray-200 rounded-xl p-6">
                <figcaption className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">{s.context}</figcaption>
                <blockquote className="text-base text-gray-900 leading-relaxed">{s.text}</blockquote>
              </figure>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CopyCard({ label, text }: { label: string; text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <p className="text-sm text-gray-900 leading-relaxed">{text}</p>
    </div>
  );
}

function PillCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-sm text-gray-900 font-medium">{text}</div>
    </div>
  );
}

function ApplicationSection({ content, branding }: { content: string; branding: ResolvedBranding }) {
  return (
    <section>
      <SectionHeader
        number="06"
        label="En contexto"
        title="Ejemplo de aplicación"
        description="Cómo encaja todo el sistema en una página real."
      />
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm print:shadow-none">
        <BlockRenderer content={content} branding={branding} />
      </div>
    </section>
  );
}

function GuideFooter({ clientName, profileName }: { clientName?: string; profileName: string }) {
  return (
    <footer className="pt-10 border-t border-gray-200 text-sm text-gray-500 flex flex-wrap items-center justify-between gap-3">
      <div>
        Guía de marca de <span className="text-gray-900 font-medium">{clientName ?? 'esta cuenta'}</span> · perfil «{profileName}».
      </div>
      <div className="text-xs">Generado el {new Date().toLocaleDateString()}</div>
    </footer>
  );
}

/* ─────────────────────────  Utilities  ───────────────────────── */

function isLight(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
