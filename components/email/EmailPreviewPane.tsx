'use client';

import { useState, useEffect, useRef } from 'react';
import type { Block } from '@/types/blocks';

interface EmailPreviewPaneProps {
  blocks: Block[];
  htmlContent?: string;
  previewText?: string | null;
}

export function EmailPreviewPane({ blocks, htmlContent, previewText }: EmailPreviewPaneProps) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const controller = new AbortController();

    debounceRef.current = setTimeout(async () => {
      const isHtmlMode = htmlContent !== undefined;
      const hasContent = isHtmlMode ? Boolean(htmlContent.trim()) : blocks.length > 0;
      if (!hasContent) {
        setHtml('');
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch('/api/portal/email/render-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(isHtmlMode
            ? { htmlContent, previewText }
            : { blockContent: { blocks, version: '1' } }),
        });
        const data = await res.json();
        if (data.success && !controller.signal.aborted) {
          setHtml(data.data.html);
        } else if (!controller.signal.aborted) {
          setHtml('');
        }
      } catch {
        if (!controller.signal.aborted) setHtml('');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [blocks, htmlContent, previewText]);

  const widthPx = previewWidth === 'desktop' ? 600 : 320;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-medium text-muted-foreground">Vista previa del correo</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPreviewWidth('desktop')}
            aria-label="Vista de escritorio"
            className={`p-1 rounded text-xs ${previewWidth === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            <span className="material-icons text-sm">monitor</span>
          </button>
          <button
            onClick={() => setPreviewWidth('mobile')}
            aria-label="Vista móvil"
            className={`p-1 rounded text-xs ${previewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
          >
            <span className="material-icons text-sm">smartphone</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        {loading && (
          <div className="text-center text-xs text-muted-foreground py-8">Generando vista previa...</div>
        )}
        {!loading && !html && (htmlContent !== undefined ? !htmlContent.trim() : blocks.length === 0) && (
          <div className="text-center text-xs text-muted-foreground py-8">Añade contenido para previsualizar el correo.</div>
        )}
        {!loading && !html && (htmlContent === undefined ? blocks.length > 0 : Boolean(htmlContent.trim())) && (
          <div className="text-center text-xs text-muted-foreground py-8">No se pudo generar la vista previa.</div>
        )}
        {html && (
          <div className="mx-auto transition-all duration-200" style={{ width: widthPx, maxWidth: '100%' }}>
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full bg-white rounded shadow-sm border border-border"
              style={{ minHeight: 400, height: '100%' }}
              title="Vista previa del correo"
            />
          </div>
        )}
      </div>
    </div>
  );
}
