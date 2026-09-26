'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Block, BlockType } from '@/types/blocks';
import { pBtnPrimary, pBtnGhost, pCard, pInput } from '@/components/portal/portal-ui';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { removeBlockById } from '@/lib/utils/blockHelpers';

interface EmailList {
  id: number;
  name: string;
  subscriberCount: number;
}

interface SavedEmailTemplate {
  id: number;
  name: string;
  subject: string | null;
  htmlContent: string;
  blockContent: { blocks?: Block[] } | null;
}

type EditorMode = 'visual' | 'html';

export default function NewPortalCampaignPage() {
  const router = useRouter();
  const [lists, setLists] = useState<EmailList[]>([]);
  const [templates, setTemplates] = useState<SavedEmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [form, setForm] = useState({
    name: '',
    subject: '',
    previewText: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    listId: '',
    htmlContent: '',
  });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  // Collapse both editor side panels on phone first-mount so the iframe gets
  // the row; users tap the chevrons to expand either as a mobile overlay.
  const [editorLeftCollapsed, setEditorLeftCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const [editorRightCollapsed, setEditorRightCollapsed] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    fetch('/api/portal/email/lists')
      .then(r => r.json())
      .then(d => {
        const fetchedLists: EmailList[] = d.data ?? [];
        setLists(fetchedLists);
        // Smart default: with exactly one list, auto-select it instead of
        // leaving "Select a list..." — most tenants only ever have one.
        if (fetchedLists.length === 1) {
          setForm(p => ({ ...p, listId: String(fetchedLists[0].id) }));
        }
      });

    fetch('/api/portal/email/templates')
      .then(r => r.json())
      .then(d => { if (d.success && Array.isArray(d.data)) setTemplates(d.data); })
      .catch(() => {});
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  async function save() {
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = { ...form };
    if (editorMode === 'visual') {
      payload.blockContent = { blocks, version: '1' };
      if (!payload.htmlContent) payload.htmlContent = '';
    }

    const res = await fetch('/api/portal/email/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'No se pudo crear la campaña'); return; }
    router.push(`/portal/email/campaigns/${data.data.id}`);
  }

  function handleBlocksChange(newBlocks: Block[]) {
    setBlocks(newBlocks);
  }

  function applySavedTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find(item => String(item.id) === templateId);
    if (!template) return;

    const templateBlocks = template.blockContent?.blocks;
    if (Array.isArray(templateBlocks) && templateBlocks.length > 0) {
      setBlocks(templateBlocks);
      setEditorMode('visual');
    } else {
      setBlocks([]);
      setEditorMode('html');
    }
    setForm(current => ({
      ...current,
      htmlContent: template.htmlContent,
      ...(template.subject?.trim() && !current.subject.trim() ? { subject: template.subject } : {}),
    }));
  }

  const inputClass = pInput;
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1';

  const canSave = form.name.trim() && form.subject.trim() && form.fromName.trim() && form.fromEmail.trim() && form.listId && (editorMode === 'visual' ? blocks.length > 0 : form.htmlContent.trim());

  return (
    <div className="w-full space-y-4 px-2">
      {/* Header — modeled after pitch deck editor */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/portal/email/campaigns"
            className={`${pBtnGhost} !px-2 !py-2`}
          >
            <span className="material-icons">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Nueva campaña</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-xs">edit_note</span>Borrador</span>
              {blocks.length > 0 && (
                <>
                  <span>·</span>
                  <span>{blocks.length} {blocks.length !== 1 ? 'bloques' : 'bloque'}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Editor mode toggle */}
          <div className="inline-flex rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setEditorMode('visual')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                editorMode === 'visual' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <span className="material-icons text-sm">dashboard</span>
              Visual
            </button>
            <button
              onClick={() => setEditorMode('html')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                editorMode === 'html' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <span className="material-icons text-sm">code</span>
              HTML
            </button>
          </div>

          <button
            onClick={() => setShowEmailPreview(!showEmailPreview)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-xl transition-colors ${
              showEmailPreview ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className="material-icons text-base">email</span>Vista previa del correo</button>

          <button
            onClick={save}
            disabled={saving || !canSave}
            className={pBtnPrimary}
          >
            {saving ? (
              <span className="material-icons animate-spin text-base">autorenew</span>
            ) : (
              <span className="material-icons text-base">save</span>
            )}
            {saving ? 'Guardando...' : 'Guardar campaña'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto"><span className="material-icons text-base">close</span></button>
        </div>
      )}

      {/* Main layout — settings sidebar + editor */}
      <div className="flex gap-4">
        {/* Settings sidebar — collapsible, like the slides panel */}
        <div className={`shrink-0 transition-all duration-200 ${settingsCollapsed ? 'w-12' : 'w-72'}`}>
          <div className={`${pCard} overflow-hidden`}>
            {settingsCollapsed ? (
              <>
                <button
                  onClick={() => setSettingsCollapsed(false)}
                  className="w-full p-2 border-b border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="Expandir ajustes"
                >
                  <span className="material-icons text-base">chevron_right</span>
                </button>
                <div className="flex flex-col items-center gap-2 py-3">
                  <span className="material-icons text-sm text-muted-foreground" title="Detalles de la campaña">campaign</span>
                  <span className="material-icons text-sm text-muted-foreground" title="Remitente">person</span>
                  <span className="material-icons text-sm text-muted-foreground" title="Destinatarios">group</span>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ajustes</span>
                  <button
                    onClick={() => setSettingsCollapsed(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Contraer ajustes"
                  >
                    <span className="material-icons text-base">chevron_left</span>
                  </button>
                </div>
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-4 space-y-5">
                  {/* Campaign Details */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="material-icons text-sm">campaign</span>Campaña</div>
                    <div>
                      <label className={labelClass}>Nombre *</label>
                      <input value={form.name} onChange={set('name')} className={inputClass} placeholder="p. ej. Boletín de marzo" />
                    </div>
                    <div>
                      <label className={labelClass}>Línea de asunto *</label>
                      <input value={form.subject} onChange={set('subject')} className={inputClass} placeholder="¿De qué trata tu correo?" />
                    </div>
                    <div>
                      <label className={labelClass}>Texto de vista previa</label>
                      <input value={form.previewText} onChange={set('previewText')} className={inputClass} placeholder="Resumen breve en la bandeja de entrada" />
                    </div>
                    <div>
                      <label htmlFor="campaign-email-template" className={labelClass}>Aplicar plantilla guardada</label>
                      <select
                        id="campaign-email-template"
                        value={selectedTemplateId}
                        onChange={e => applySavedTemplate(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Selecciona una plantilla…</option>
                        {templates.map(template => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                      {templates.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Aún no hay plantillas. <Link href="/portal/email/templates" className="text-primary hover:underline">Crear una</Link>
                        </p>
                      )}
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Sender */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="material-icons text-sm">person</span>Remitente</div>
                    <div>
                      <label className={labelClass}>Nombre del remitente *</label>
                      <input value={form.fromName} onChange={set('fromName')} className={inputClass} placeholder="Tu nombre o empresa" />
                    </div>
                    <div>
                      <label className={labelClass}>Email del remitente *</label>
                      <input type="email" value={form.fromEmail} onChange={set('fromEmail')} className={inputClass} placeholder="hola@tudominio.com" />
                    </div>
                    <div>
                      <label className={labelClass}>Correo de respuesta</label>
                      <input type="email" value={form.replyTo} onChange={set('replyTo')} className={inputClass} placeholder="Opcional" />
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Recipients */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="material-icons text-sm">group</span>Destinatarios</div>
                    <div>
                      <label htmlFor="campaign-list" className={labelClass}>Lista de suscriptores *</label>
                      <select id="campaign-list" value={form.listId} onChange={set('listId')} className={inputClass}>
                        <option value="">Selecciona una lista...</option>
                        {lists.map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.subscriberCount})</option>
                        ))}
                      </select>
                      {lists.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <Link href="/portal/email/lists" className="text-primary hover:underline">Crea una lista primero</Link>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 min-w-0 space-y-4">
          {editorMode === 'visual' ? (
            <div className={showEmailPreview ? 'flex flex-col md:flex-row gap-4' : ''}>
              <div className={`${showEmailPreview ? 'flex-1 min-w-0' : 'w-full'}`}>
                {/* Visual Editor Shell — same as pitch deck */}
                <div className="rounded-2xl overflow-hidden [&>div]:!h-[calc(100vh-180px)]" style={{ minHeight: '600px' }}>
                  <VisualEditorShell
                    key={`email-editor`}
                    blocks={blocks}
                    selectedBlockId={null}
                    viewport="desktop"
                    previewMode={previewMode}
                    initialZoom={100}
                    leftCollapsed={editorLeftCollapsed}
                    rightCollapsed={editorRightCollapsed}
                    onLeftCollapsedChange={setEditorLeftCollapsed}
                    onRightCollapsedChange={setEditorRightCollapsed}
                    iframeSrc={`/portal/email/editor-preview?${previewMode ? '' : '_edit=true'}`}
                    onBlocksChange={handleBlocksChange}
                    onSelectBlock={() => {}}
                    onAddBlock={(type: string) => {
                      const newBlock = createEmailBlock(type as BlockType, blocks.length + 1);
                      handleBlocksChange([...blocks, newBlock]);
                    }}
                    onDeleteBlock={(blockId: string) => {
                      handleBlocksChange(removeBlockById(blocks, blockId));
                    }}
                    onUpdateBlock={(blockId: string, updates: Partial<Block>) => {
                      handleBlocksChange(blocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b));
                    }}
                    siteId={undefined}
                  />
                </div>
              </div>

              {showEmailPreview && (
                <div className={`w-full sm:w-[400px] shrink-0 ${pCard} overflow-hidden`} style={{ height: 'calc(100vh - 180px)' }}>
                  <EmailPreviewPane blocks={blocks} />
                </div>
              )}
            </div>
          ) : (
            <div className={showEmailPreview ? 'flex flex-col md:flex-row gap-4' : ''}>
              <div className={showEmailPreview ? 'flex-1 min-w-0' : 'w-full'}>
                <div className={`${pCard} overflow-hidden`}>
                  <div className="px-5 py-3 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Contenido HTML sin procesar</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    <textarea
                      value={form.htmlContent}
                      onChange={set('htmlContent')}
                      rows={24}
                      className={`${inputClass} font-mono text-xs`}
                      placeholder={`<h1>Hola,</h1>\n<p>El contenido de tu correo aquí...</p>`}
                    />
                    <p className="text-xs text-muted-foreground">Escribe o pega el HTML. Se añade el pie de cancelación de suscripción al enviar.</p>
                  </div>
                </div>
              </div>
              {showEmailPreview && (
                <div className={`w-full md:w-[400px] shrink-0 ${pCard} overflow-hidden`} style={{ height: 'calc(100vh - 180px)' }}>
                  <EmailPreviewPane blocks={[]} htmlContent={form.htmlContent} previewText={form.previewText} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function createEmailBlock(type: BlockType, order: number): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Empieza a escribir el contenido de tu correo...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Título del correo', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Haz clic aquí', url: '', variant: 'primary', size: 'md', alignment: 'center' };
    case 'spacer':
      return { ...base, type: 'spacer', height: 'md' };
    case 'divider':
      return { ...base, type: 'divider', lineStyle: 'solid' };
    case 'columns':
      return { ...base, type: 'columns', columns: [
        { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
        { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
      ], gap: 'md' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Añade una cita memorable...', author: '' };
    case 'section':
      return { ...base, type: 'section', blocks: [] };
    case 'social-links':
      return { ...base, type: 'social-links', links: [], alignment: 'center' };
    case 'email-header':
      return { ...base, type: 'email-header', alignment: 'center' };
    case 'email-footer':
      return { ...base, type: 'email-footer', showUnsubscribe: true };
    default:
      return { ...base, type: 'text', content: 'Nuevo bloque', alignment: 'left', size: 'base' };
  }
}
