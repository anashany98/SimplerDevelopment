'use client';

import { useState } from 'react';
import { Block } from '@/types/blocks';
import { Breakpoint, BREAKPOINTS, SpacingSize, SpacingValue, ResponsiveSettings as ResponsiveSettingsType } from '@/types/responsive';
import { TokenColorPicker } from './TokenColorPicker';
import { GoogleFontPicker } from './GoogleFontPicker';
import { GradientBuilder } from './GradientBuilder';
import { BoxShadowBuilder } from './BoxShadowBuilder';
import MediaPicker from '@/components/admin/MediaPicker';
import { StyleSection, BoxModelControl, StaticBoxModel, pxSizes } from './StyleSettings.parts';

interface StyleSettingsProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function StyleSettings({ block, onChange, currentViewport }: StyleSettingsProps) {
  // Get current style values or defaults
  const style = typeof block.style === 'object' ? block.style : {};
  const responsive = block.responsive || {};
  const [perSideBorderOpen, setPerSideBorderOpen] = useState(false);
  const [perCornerRadiusOpen, setPerCornerRadiusOpen] = useState(false);

  const updateStyle = (property: string, value: string | number | boolean | null | undefined) => {
    const existingStyle = typeof block.style === 'object' ? block.style : {};
    onChange({
      style: {
        ...existingStyle,
        [property]: value,
      },
    });
  };

  const updateResponsiveSetting = (
    property: keyof ResponsiveSettingsType,
    breakpoint: Breakpoint,
    value: string | number | boolean | null | undefined
  ) => {
    const currentProperty = responsive[property] || {};
    onChange({
      responsive: {
        ...responsive,
        [property]: {
          ...currentProperty,
          [breakpoint]: value,
        },
      },
    });
  };

  // Write a layout property scoped to the active breakpoint (desktop-first).
  // Reads from block.responsiveStyle[currentViewport], falling back to block.style.
  const updateResponsiveStyle = (property: string, value: string | number | boolean | null | undefined) => {
    const existing = block.responsiveStyle || {};
    const existingBp = existing[currentViewport] || {};

    // When writing a flex or grid sub-property and display isn't yet stored for
    // this viewport (neither in responsiveStyle nor in block.style), anchor the
    // effective display value so the generated CSS class has the right context.
    // Without this, flex-direction/justify-content etc. have no effect because
    // the element has no explicit display and the browser defaults to block.
    const FLEX_SUBPROPS = ['flexDirection', 'justifyContent', 'alignItems', 'flexWrap', 'gap'];
    const GRID_SUBPROPS = ['gridTemplateColumns', 'gridTemplateRows', 'gridGap'];
    const coWrite: Partial<typeof existingBp> = {};
    if (!existingBp.display && !style.display) {
      if (FLEX_SUBPROPS.includes(property)) coWrite.display = 'flex';
      if (GRID_SUBPROPS.includes(property)) coWrite.display = 'grid';
    }

    onChange({
      responsiveStyle: {
        ...existing,
        [currentViewport]: {
          ...existingBp,
          ...coWrite,
          [property]: value,
        },
      },
    });
  };

  // Effective layout style: flat block.style is the baseline, breakpoint-specific
  // responsiveStyle[currentViewport] overrides for the currently active breakpoint.
  const responsiveStyleForViewport = block.responsiveStyle?.[currentViewport] || {};
  const effectiveStyle = { ...style, ...responsiveStyleForViewport };

  const spacingSizes: SpacingSize[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const fontSizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];

  // Blocks that don't have meaningful text content — no font size controls needed
  const nonTextBlocks: string[] = ['spacer', 'divider', 'image', 'video', 'youtube'];
  const hasTextContent = !nonTextBlocks.includes(block.type);

  // The columns block manages its own layout (row/stack + per-column widths +
  // its own gap prop), so generic display/flex/grid CSS controls don't apply and
  // only confuse — hide them for columns (Align Self / Size / etc. stay).
  // A button is a single inline <Link> leaf — generic flex/grid Display controls
  // don't apply and duplicate the Content tab (VEQA-043). Max Width / Size stay.
  const noDisplayControls = block.type === 'columns' || block.type === 'button';

  // VEQA-058: SpacerBlockRender reads only the Content-tab height enum, never
  // responsiveStyle width/height — hide those dead Size inputs for spacers.
  const hideSizeWidthHeight = block.type === 'spacer';

  const selectClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono';
  const toggleBtn = (active: boolean) =>
    `px-2 py-1.5 text-[10px] rounded border transition-colors ${
      active
        ? 'border-primary bg-primary/10 text-primary font-medium'
        : 'border-border text-muted-foreground hover:border-foreground/30'
    }`;

  return (
    <div className="-mx-4">
      {/* ── Layout ──────────────────────────────────────────────── */}
      <StyleSection title="Diseño" defaultOpen>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="material-icons text-sm">{BREAKPOINTS[currentViewport].icon}</span>
          <span>Editando para {BREAKPOINTS[currentViewport].label}</span>
        </div>
        {!noDisplayControls && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Visualización</label>
          <select value={effectiveStyle.display || 'flex'} onChange={(e) => updateResponsiveStyle('display', e.target.value)} className={selectClass}>
            <option value="">Bloque</option>
            <option value="flex">Flex</option>
            <option value="inline-flex">Flex en línea</option>
            <option value="grid">Grid</option>
            <option value="inline-block">Bloque en línea</option>
            <option value="none">Ninguno (oculto)</option>
          </select>
        </div>
        )}

        {!noDisplayControls && (!effectiveStyle.display || effectiveStyle.display === 'flex' || effectiveStyle.display === 'inline-flex') && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Dirección</label>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { value: 'row', label: 'Fila', icon: 'arrow_forward' },
                  { value: 'column', label: 'Columna', icon: 'arrow_downward' },
                  { value: 'row-reverse', label: 'Fila inv.', icon: 'arrow_back' },
                  { value: 'column-reverse', label: 'Columna inv.', icon: 'arrow_upward' },
                ] as const).map(({ value, label, icon }) => (
                  <button key={value} type="button" onClick={() => updateResponsiveStyle('flexDirection', value)} className={`${toggleBtn((effectiveStyle.flexDirection || 'row') === value)} text-center`} title={label}>
                    <span className="material-icons text-sm block">{icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Justificar contenido</label>
              <div className="grid grid-cols-3 gap-1">
                {(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => updateResponsiveStyle('justifyContent', v)} className={toggleBtn((effectiveStyle.justifyContent || 'flex-start') === v)}>
                    {v.replace('flex-', '').replace('space-', '')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Alinear elementos</label>
              <div className="grid grid-cols-5 gap-1">
                {(['flex-start', 'center', 'flex-end', 'stretch', 'baseline'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => updateResponsiveStyle('alignItems', v)} className={toggleBtn((effectiveStyle.alignItems || 'stretch') === v)}>
                    {v.replace('flex-', '').slice(0, 6)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Ajuste</label>
              <div className="grid grid-cols-3 gap-1">
                {(['nowrap', 'wrap', 'wrap-reverse'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => updateResponsiveStyle('flexWrap', v)} className={toggleBtn((effectiveStyle.flexWrap || 'nowrap') === v)}>
                    {v === 'nowrap' ? 'Sin ajuste' : v === 'wrap' ? 'Ajustar' : 'Invertir'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Espacio</label>
              <select value={effectiveStyle.gap || ''} onChange={(e) => updateResponsiveStyle('gap', e.target.value)} className={selectClass}>
                <option value="">Ninguno</option>
                <option value="0.25rem">4px</option><option value="0.5rem">8px</option><option value="0.75rem">12px</option>
                <option value="1rem">16px</option><option value="1.5rem">24px</option><option value="2rem">32px</option>
                <option value="3rem">48px</option><option value="4rem">64px</option>
              </select>
            </div>
          </>
        )}

        {!noDisplayControls && effectiveStyle.display === 'grid' && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Columnas</label>
              <input type="text" value={effectiveStyle.gridTemplateColumns || ''} onChange={(e) => updateResponsiveStyle('gridTemplateColumns', e.target.value)} placeholder="1fr 1fr 1fr" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Filas</label>
              <input type="text" value={effectiveStyle.gridTemplateRows || ''} onChange={(e) => updateResponsiveStyle('gridTemplateRows', e.target.value)} placeholder="auto" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Espacio</label>
              <input type="text" value={effectiveStyle.gridGap || ''} onChange={(e) => updateResponsiveStyle('gridGap', e.target.value)} placeholder="16px" className={inputClass} />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Alineación propia</label>
          <select value={effectiveStyle.alignSelf || ''} onChange={(e) => updateResponsiveStyle('alignSelf', e.target.value)} className={selectClass}>
            <option value="">Automático</option><option value="flex-start">Comenzar</option><option value="center">Centrado</option>
            <option value="flex-end">Final</option><option value="stretch">Estirar</option><option value="baseline">Línea base</option>
          </select>
        </div>

        {/* Image width preset — a semantic block-level field (not a CSS `width` style),
            so it writes directly to the block via onChange rather than updateResponsiveStyle. */}
        {block.type === 'image' && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Ancho</label>
            <select value={(block as unknown as Record<string, unknown>).width as string || 'full'} onChange={(e) => onChange({ width: e.target.value } as Partial<Block>)} className={selectClass}>
              <option value="small">Pequeño</option>
              <option value="medium">Media</option>
              <option value="large">Grande</option>
              <option value="full">Completa</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Desbordamiento</label>
          <select value={effectiveStyle.overflow || ''} onChange={(e) => updateResponsiveStyle('overflow', e.target.value)} className={selectClass}>
            <option value="">Visible</option><option value="hidden">Oculto</option><option value="scroll">Scroll</option><option value="auto">Automático</option>
          </select>
        </div>

        {/* Position */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Posición</label>
          <select value={effectiveStyle.position || ''} onChange={(e) => updateResponsiveStyle('position', e.target.value)} className={selectClass}>
            <option value="">Static</option><option value="relative">Relative</option><option value="absolute">Absolute</option>
            <option value="fixed">Fixed</option><option value="sticky">Sticky</option>
          </select>
        </div>
        {effectiveStyle.position && effectiveStyle.position !== 'static' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-muted-foreground mb-1">Arriba</label><input type="text" value={effectiveStyle.top || ''} onChange={(e) => updateResponsiveStyle('top', e.target.value)} placeholder="auto" className={inputClass} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1">Derecha</label><input type="text" value={effectiveStyle.right || ''} onChange={(e) => updateResponsiveStyle('right', e.target.value)} placeholder="auto" className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-muted-foreground mb-1">Abajo</label><input type="text" value={effectiveStyle.bottom || ''} onChange={(e) => updateResponsiveStyle('bottom', e.target.value)} placeholder="auto" className={inputClass} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1">Izquierda</label><input type="text" value={effectiveStyle.left || ''} onChange={(e) => updateResponsiveStyle('left', e.target.value)} placeholder="auto" className={inputClass} /></div>
            </div>
            <div><label className="block text-xs text-muted-foreground mb-1">Índice Z</label><input type="text" value={effectiveStyle.zIndex || ''} onChange={(e) => updateResponsiveStyle('zIndex', e.target.value)} placeholder="auto" className={inputClass} /></div>
          </>
        )}
      </StyleSection>

      {/* ── Size ─────────────────────────────────────────────────── */}
      <StyleSection title="Tamaño">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="material-icons text-sm">{BREAKPOINTS[currentViewport].icon}</span>
          <span>Editando para {BREAKPOINTS[currentViewport].label}</span>
        </div>
        {!hideSizeWidthHeight && <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs text-muted-foreground mb-1">Ancho</label><input type="text" value={effectiveStyle.width || ''} onChange={(e) => updateResponsiveStyle('width', e.target.value)} placeholder="auto" className={inputClass} /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Alto</label><input type="text" value={effectiveStyle.height || ''} onChange={(e) => updateResponsiveStyle('height', e.target.value)} placeholder="auto" className={inputClass} /></div>
        </div>}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs text-muted-foreground mb-1">Ancho máx.</label><input type="text" value={effectiveStyle.maxWidth || ''} onChange={(e) => updateResponsiveStyle('maxWidth', e.target.value)} placeholder="none" className={inputClass} /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Alto mín.</label><input type="text" value={effectiveStyle.minHeight || ''} onChange={(e) => updateResponsiveStyle('minHeight', e.target.value)} placeholder="0" className={inputClass} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs text-muted-foreground mb-1">Ancho mín.</label><input type="text" value={effectiveStyle.minWidth || ''} onChange={(e) => updateResponsiveStyle('minWidth', e.target.value)} placeholder="none" className={inputClass} /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Alto máx.</label><input type="text" value={effectiveStyle.maxHeight || ''} onChange={(e) => updateResponsiveStyle('maxHeight', e.target.value)} placeholder="none" className={inputClass} /></div>
        </div>
      </StyleSection>

      {/* ── Margin & Padding ────────────────────────────────────── */}
      <StyleSection title="Margen y relleno">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="material-icons text-sm">{BREAKPOINTS[currentViewport].icon}</span>
          <span>Editando para {BREAKPOINTS[currentViewport].label}</span>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Margen</label>
          <BoxModelControl
            top={responsive.marginTop?.[currentViewport] || ''} bottom={responsive.marginBottom?.[currentViewport] || ''}
            left={responsive.marginLeft?.[currentViewport] || ''} right={responsive.marginRight?.[currentViewport] || ''}
            onTopChange={(v) => updateResponsiveSetting('marginTop', currentViewport, v as SpacingValue)}
            onBottomChange={(v) => updateResponsiveSetting('marginBottom', currentViewport, v as SpacingValue)}
            onLeftChange={(v) => updateResponsiveSetting('marginLeft', currentViewport, v as SpacingValue)}
            onRightChange={(v) => updateResponsiveSetting('marginRight', currentViewport, v as SpacingValue)}
            sizes={spacingSizes} outerLabel="margin" color="blue"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Relleno</label>
          <BoxModelControl
            top={responsive.paddingTop?.[currentViewport] || ''} bottom={responsive.paddingBottom?.[currentViewport] || ''}
            left={responsive.paddingLeft?.[currentViewport] || ''} right={responsive.paddingRight?.[currentViewport] || ''}
            onTopChange={(v) => updateResponsiveSetting('paddingTop', currentViewport, v as SpacingValue)}
            onBottomChange={(v) => updateResponsiveSetting('paddingBottom', currentViewport, v as SpacingValue)}
            onLeftChange={(v) => updateResponsiveSetting('paddingLeft', currentViewport, v as SpacingValue)}
            onRightChange={(v) => updateResponsiveSetting('paddingRight', currentViewport, v as SpacingValue)}
            sizes={spacingSizes} outerLabel="padding" color="green"
          />
        </div>
        {/* VEQA-034: static padding + static margin combined into one nested box-model control */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Espaciado estático</label>
          <StaticBoxModel
            padding={style.padding} margin={style.margin}
            onPaddingChange={(v) => updateStyle('padding', v)}
            onMarginChange={(v) => updateStyle('margin', v)}
            sizes={pxSizes}
          />
        </div>
      </StyleSection>

      {/* ── Visibility ──────────────────────────────────────────── */}
      <StyleSection title="Visibilidad">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={responsive.visibility?.desktop !== false} onChange={(e) => updateResponsiveSetting('visibility', 'desktop', e.target.checked)} className="rounded border-border" />
          <span className="font-medium">Visible en {BREAKPOINTS.desktop.label}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={responsive.visibility?.tablet !== false} onChange={(e) => updateResponsiveSetting('visibility', 'tablet', e.target.checked)} className="rounded border-border" />
          <span className="font-medium">Visible en {BREAKPOINTS.tablet.label}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={responsive.visibility?.mobile !== false} onChange={(e) => updateResponsiveSetting('visibility', 'mobile', e.target.checked)} className="rounded border-border" />
          <span className="font-medium">Visible en {BREAKPOINTS.mobile.label}</span>
        </label>
        <p className="text-xs text-muted-foreground">Oculta este bloque en determinados tamaños de dispositivo</p>
      </StyleSection>

      {/* ── Background ──────────────────────────────────────────── */}
      <StyleSection title="Fondo">
        {/* Unified color/gradient control:
            - 0 stops = no bg
            - 1 stop  = solid (writes backgroundColor, clears backgroundGradient)
            - 2+ stops = gradient (writes backgroundGradient, clears backgroundColor)
           Keeping them mutually exclusive prevents the bgColor bleeding through
           a gradient with translucent stops. */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Colores</label>
          <GradientBuilder
            backgroundColor={style.backgroundColor || ''}
            backgroundGradient={style.backgroundGradient || ''}
            onChange={(patch) => {
              const existingStyle = typeof block.style === 'object' ? block.style : {};
              onChange({
                style: {
                  ...existingStyle,
                  backgroundColor: patch.backgroundColor,
                  backgroundGradient: patch.backgroundGradient,
                },
              });
            }}
          />
        </div>

        {/* Image */}
        <MediaPicker value={style.backgroundImage || ''} onChange={(url) => updateStyle('backgroundImage', url)} label="Imagen de fondo" />
        {style.backgroundImage && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Tamaño</label>
                <select value={style.backgroundSize || ''} onChange={(e) => updateStyle('backgroundSize', e.target.value)} className={selectClass}>
                  <option value="">Automático</option>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="100% 100%">Estirar</option>
                  <option value="50%">50%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Posición</label>
                <select value={style.backgroundPosition || ''} onChange={(e) => updateStyle('backgroundPosition', e.target.value)} className={selectClass}>
                  <option value="">Centrado</option>
                  <option value="top">Arriba</option>
                  <option value="top left">Arriba izquierda</option>
                  <option value="top right">Arriba derecha</option>
                  <option value="bottom">Abajo</option>
                  <option value="bottom left">Abajo izquierda</option>
                  <option value="bottom right">Abajo derecha</option>
                  <option value="left">Izquierda</option>
                  <option value="right">Derecha</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Repetición</label>
                <select value={style.backgroundRepeat || ''} onChange={(e) => updateStyle('backgroundRepeat', e.target.value)} className={selectClass}>
                  <option value="">Predeterminado</option>
                  <option value="no-repeat">Sin repetición</option>
                  <option value="repeat">Repetir</option>
                  <option value="repeat-x">Repetir X</option>
                  <option value="repeat-y">Repetir Y</option>
                  <option value="space">Espacio</option>
                  <option value="round">Redondo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Anclaje</label>
                <select value={style.backgroundAttachment || ''} onChange={(e) => updateStyle('backgroundAttachment', e.target.value)} className={selectClass}>
                  <option value="">Scroll</option>
                  <option value="fixed">Fijo (parallax)</option>
                  <option value="local">Local</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Blend Mode */}
        {(style.backgroundImage || style.backgroundGradient) && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Modo de fusión del fondo</label>
            <p className="text-[10px] text-muted-foreground/70 mb-1.5 -mt-0.5">Fusiona la imagen o el degradado de fondo con el color de fondo.</p>
            <select value={style.backgroundBlendMode || ''} onChange={(e) => updateStyle('backgroundBlendMode', e.target.value)} className={selectClass}>
              <option value="">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
              <option value="hard-light">Hard Light</option>
              <option value="soft-light">Soft Light</option>
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
              <option value="hue">Hue</option>
              <option value="saturation">Saturation</option>
              <option value="luminosity">Luminosity</option>
            </select>
          </div>
        )}
      </StyleSection>

      {/* ── Typography ──────────────────────────────────────────── */}
      {/* Non-text blocks (image/video/spacer/divider) have no text, so the whole
          Typography category is hidden for them, not just the font fields. */}
      {hasTextContent && (
      <StyleSection title="Tipografía">
        <TokenColorPicker label="Color del texto" value={style.color || ''} onChange={(v) => updateStyle('color', v)} placeholder="#000000" />

        {hasTextContent && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Tamaño de fuente</label>
              <select value={style.fontSize || ''} onChange={(e) => updateStyle('fontSize', e.target.value)} className={selectClass}>
                <option value="">Predeterminado</option>
                <option value="0.75rem">XS (12px)</option><option value="0.875rem">SM (14px)</option>
                <option value="1rem">Base (16px)</option><option value="1.125rem">LG (18px)</option>
                <option value="1.25rem">XL (20px)</option><option value="1.5rem">2XL (24px)</option>
                <option value="1.875rem">3XL (30px)</option><option value="2.25rem">4XL (36px)</option>
                <option value="3rem">5XL (48px)</option><option value="3.75rem">6XL (60px)</option>
                <option value="4.5rem">7XL (72px)</option><option value="6rem">8XL (96px)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Tamaño de fuente adaptable</label>
              <select value={responsive.fontSize?.[currentViewport] || ''} onChange={(e) => updateResponsiveSetting('fontSize', currentViewport, e.target.value)} className={selectClass}>
                <option value="">Predeterminado</option>
                {fontSizes.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Anulación por punto de ruptura para {BREAKPOINTS[currentViewport].label}</p>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Familia tipográfica</label>
          <GoogleFontPicker
            value={style.fontFamily || ''}
            onChange={(v) => updateStyle('fontFamily', v)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Grosor de la fuente</label>
          <select value={style.fontWeight || ''} onChange={(e) => updateStyle('fontWeight', e.target.value)} className={selectClass}>
            <option value="">Predeterminado</option><option value="300">Fina</option><option value="400">Normal</option>
            <option value="500">Media</option><option value="600">Seminegrita</option><option value="700">Negrita</option>
            <option value="800">Extra negrita</option><option value="900">Negra</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Altura de línea</label>
          <select value={style.lineHeight || ''} onChange={(e) => updateStyle('lineHeight', e.target.value)} className={selectClass}>
            <option value="">Predeterminado</option><option value="1">Ninguno</option><option value="1.25">Compacta</option>
            <option value="1.375">Ajustada</option><option value="1.5">Normal</option><option value="1.625">Relajada</option><option value="2">Amplia</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Espaciado entre letras</label>
          <select value={style.letterSpacing || ''} onChange={(e) => updateStyle('letterSpacing', e.target.value)} className={selectClass}>
            <option value="">Predeterminado</option><option value="-0.05em">Más estrecho</option><option value="-0.025em">Estrecho</option>
            <option value="0">Normal</option><option value="0.025em">Ancho</option><option value="0.05em">Más ancho</option><option value="0.1em">El más ancho</option>
          </select>
        </div>

        {hasTextContent && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Alineación del texto</label>
              <div className="grid grid-cols-4 gap-1">
                {([{ v: '', l: 'Auto', i: 'format_align_left' }, { v: 'left', l: 'Izquierda', i: 'format_align_left' }, { v: 'center', l: 'Centrado', i: 'format_align_center' }, { v: 'right', l: 'Derecha', i: 'format_align_right' }] as const).map(({ v, l, i }) => (
                  <button key={l} type="button" onClick={() => updateStyle('textAlign', v)} className={toggleBtn((style.textAlign || '') === v)} title={l}>
                    <span className="material-icons text-sm">{i}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Transformación</label>
              <div className="grid grid-cols-4 gap-1">
                {([{ v: '', l: 'Ninguno' }, { v: 'uppercase', l: 'ABC' }, { v: 'lowercase', l: 'abc' }, { v: 'capitalize', l: 'Abc' }] as const).map(({ v, l }) => (
                  <button key={l} type="button" onClick={() => updateStyle('textTransform', v)} className={toggleBtn((style.textTransform || '') === v)}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Decoración</label>
              <div className="grid grid-cols-3 gap-1">
                {([{ v: '', l: 'Ninguno' }, { v: 'underline', l: 'Subrayado' }, { v: 'line-through', l: 'Tachado' }] as const).map(({ v, l }) => (
                  <button key={l} type="button" onClick={() => updateStyle('textDecoration', v)} className={toggleBtn((style.textDecoration || '') === v)}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </StyleSection>
      )}

      {/* ── Border ──────────────────────────────────────────────── */}
      <StyleSection title="Borde">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Ancho del borde</label>
          <div className="flex gap-1.5">
            <select value={style.borderWidth || ''} onChange={(e) => {
              const v = e.target.value;
              if (v && !style.borderStyle) {
                const existingStyle = typeof block.style === 'object' ? block.style : {};
                onChange({ style: { ...existingStyle, borderWidth: v, borderStyle: 'solid' } });
              } else {
                updateStyle('borderWidth', v);
              }
            }} className={`${selectClass} flex-1 min-w-0`}>
              <option value="">Ninguno</option><option value="1px">1px</option><option value="2px">2px</option><option value="3px">3px</option><option value="4px">4px</option><option value="6px">6px</option><option value="8px">8px</option>
              {style.borderWidth && !['1px','2px','3px','4px','6px','8px'].includes(style.borderWidth) && (
                <option value={style.borderWidth}>{style.borderWidth}</option>
              )}
            </select>
            <input
              type="text"
              value={style.borderWidth || ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v && !style.borderStyle) {
                  const existingStyle = typeof block.style === 'object' ? block.style : {};
                  onChange({ style: { ...existingStyle, borderWidth: v, borderStyle: 'solid' } });
                } else {
                  updateStyle('borderWidth', v);
                }
              }}
              placeholder="Personalizado"
              className={`${inputClass} w-20 shrink-0`}
            />
          </div>
        </div>
        {style.borderWidth && (
          <>
            <TokenColorPicker label="Color del borde" value={style.borderColor || ''} onChange={(v) => updateStyle('borderColor', v)} placeholder="#e5e7eb" />
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Estilo</label>
              <select value={style.borderStyle || 'solid'} onChange={(e) => updateStyle('borderStyle', e.target.value)} className={selectClass}>
                <option value="solid">Sólido</option><option value="dashed">Discontinuo</option><option value="dotted">Punteado</option><option value="double">Doble</option><option value="groove">Acanalado</option><option value="ridge">Cresta</option><option value="inset">Interior</option><option value="outset">Exterior</option>
              </select>
            </div>
          </>
        )}
        {/* Per-side border overrides — always available */}
        <div>
          <button type="button" onClick={() => setPerSideBorderOpen(o => !o)} className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
            <span className="material-icons text-xs">{perSideBorderOpen ? 'expand_less' : 'expand_more'}</span>
            Bordes por lado
          </button>
          {perSideBorderOpen && <div className="mt-2 space-y-2">
            {(['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => {
              const widthKey = `border${side}Width` as keyof typeof style;
              const colorKey = `border${side}Color` as keyof typeof style;
              const styleKey = `border${side}Style` as keyof typeof style;
              return (
                <div key={side} className="grid grid-cols-1 sm:grid-cols-3 gap-1 items-end">
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{side} W</label>
                    <select value={(style[widthKey] as string) || ''} onChange={(e) => {
                      const v = e.target.value;
                      // Auto-set border style to solid when width is set
                      if (v && v !== '0px' && !(style[styleKey] as string)) {
                        const existingStyle = typeof block.style === 'object' ? block.style : {};
                        onChange({ style: { ...existingStyle, [widthKey]: v, [styleKey]: 'solid' } });
                      } else {
                        updateStyle(widthKey as string, v);
                      }
                    }} className={inputClass}>
                      <option value="">-</option><option value="0px">0</option><option value="1px">1</option><option value="2px">2</option><option value="3px">3</option><option value="4px">4</option><option value="6px">6</option><option value="8px">8</option>
                    </select>
                  </div>
                  <div>
                    <TokenColorPicker label="Color" value={(style[colorKey] as string) || ''} onChange={(v) => updateStyle(colorKey as string, v)} placeholder="#000" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Estilo</label>
                    <select value={(style[styleKey] as string) || ''} onChange={(e) => updateStyle(styleKey as string, e.target.value)} className={inputClass}>
                      <option value="">-</option><option value="solid">Sólido</option><option value="dashed">Discontinuo</option><option value="dotted">Punteado</option><option value="double">Doble</option><option value="none">Ninguno</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>}
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Radio del borde</label>
          <div className="flex gap-1.5">
            <select value={style.borderRadius || ''} onChange={(e) => updateStyle('borderRadius', e.target.value)} className={`${selectClass} flex-1 min-w-0`}>
              <option value="">Ninguno</option><option value="0.125rem">XS (2px)</option><option value="0.25rem">SM (4px)</option><option value="0.375rem">MD (6px)</option>
              <option value="0.5rem">LG (8px)</option><option value="0.75rem">XL (12px)</option>
              <option value="1rem">2XL (16px)</option><option value="1.25rem">3XL (20px)</option><option value="1.5rem">4XL (24px)</option><option value="2rem">5XL (32px)</option><option value="9999px">Completo (pastilla)</option>
              {style.borderRadius && !['0.125rem','0.25rem','0.375rem','0.5rem','0.75rem','1rem','1.25rem','1.5rem','2rem','9999px'].includes(style.borderRadius) && (
                <option value={style.borderRadius}>{style.borderRadius}</option>
              )}
            </select>
            <input
              type="text"
              value={style.borderRadius || ''}
              onChange={(e) => updateStyle('borderRadius', e.target.value)}
              placeholder="Personalizado"
              className={`${inputClass} w-20 shrink-0`}
            />
          </div>
        </div>
        {/* Per-corner radius overrides */}
        {style.borderRadius && (
          <div>
            <button type="button" onClick={() => setPerCornerRadiusOpen(o => !o)} className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
              <span className="material-icons text-xs">{perCornerRadiusOpen ? 'expand_less' : 'expand_more'}</span>
              Radio por esquina
            </button>
            {perCornerRadiusOpen && <div className="mt-2 grid grid-cols-2 gap-2">
              {([['TopLeft', 'TL'], ['TopRight', 'TR'], ['BottomLeft', 'BL'], ['BottomRight', 'BR']] as const).map(([corner, label]) => {
                const key = `border${corner}Radius` as keyof typeof style;
                return (
                  <div key={corner}>
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{label}</label>
                    <input type="text" value={(style[key] as string) || ''} onChange={(e) => updateStyle(key as string, e.target.value)} className={inputClass} placeholder="inherit" />
                  </div>
                );
              })}
            </div>}
          </div>
        )}
      </StyleSection>

      {/* ── Shadows & Effects ───────────────────────────────────── */}
      <StyleSection title="Sombras y efectos">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Sombra de caja</label>
          {/* VEQA-023: replaced canned preset select with an X/Y/blur/spread/color/inset builder */}
          <BoxShadowBuilder value={style.boxShadow || ''} onChange={(v) => updateStyle('boxShadow', v)} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Opacidad</label>
          <div className="flex items-center gap-3">
            <input type="range" min="0" max="100" value={style.opacity ? parseFloat(style.opacity) * 100 : 100} onChange={(e) => updateStyle('opacity', (parseInt(e.target.value) / 100).toString())} className="flex-1" />
            <span className="text-xs text-muted-foreground w-8 text-right">{style.opacity ? Math.round(parseFloat(style.opacity) * 100) : 100}%</span>
          </div>
        </div>
        {/* Transition control removed — VEQA-024: it had no visible effect in
            the static editor (no hover/animation trigger). The `style.transition`
            data field is retained; author custom transitions via CSS Properties. */}
      </StyleSection>

      {/* ── CSS Properties ──────────────────────────────────────── */}
      <StyleSection title="Propiedades CSS">
        <textarea
          value={style.customCSS || ''}
          onChange={(e) => updateStyle('customCSS', e.target.value)}
          placeholder="propiedad: valor; propiedad: valor;"
          rows={3}
          className="w-full text-xs rounded border border-border bg-background px-3 py-2 text-foreground font-mono resize-y"
        />
        <p className="text-[10px] text-muted-foreground">
          Reglas CSS sin procesar. Ejemplo: <code>filter: blur(2px); mix-blend-mode: multiply</code>
        </p>
      </StyleSection>
    </div>
  );
}
