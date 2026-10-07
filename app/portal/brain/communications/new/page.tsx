'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput, pSectionTitle } from '@/components/portal/portal-ui';

interface AdapterInfo {
  id: string;
  label: string;
  description: string;
  icon: string;
}

interface ParticipantDraft {
  name: string;
  email: string;
}

export default function NewBrainMeetingPage() {
  const router = useRouter();

  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [adapterId, setAdapterId] = useState<string>('paste');
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [transcript, setTranscript] = useState('');
  const [participants, setParticipants] = useState<ParticipantDraft[]>([{ name: '', email: '' }]);
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; mimeType: string; byteCount: number } | null>(null);
  const [link, setLink] = useState<{ type: 'company' | 'deal'; id: number; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/portal/brain/adapters')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setAdapters(json.data);
          if (!json.data.find((a: AdapterInfo) => a.id === adapterId)) {
            setAdapterId(json.data[0]?.id ?? 'paste');
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateParticipant = (i: number, patch: Partial<ParticipantDraft>) => {
    setParticipants((cur) => cur.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const addParticipant = () => setParticipants((cur) => [...cur, { name: '', email: '' }]);
  const removeParticipant = (i: number) => setParticipants((cur) => cur.filter((_, idx) => idx !== i));

  const submit = async (alsoProcess: boolean) => {
    setError(null);
    if (!transcript.trim()) {
      setError('La transcripción es obligatoria.');
      return;
    }
    setCreating(true);

    try {
      const cleanedParticipants = participants
        .map((p) => ({ name: p.name.trim(), email: p.email.trim() || undefined }))
        .filter((p) => p.name);

      const baseInput = {
        transcript,
        title: title.trim() || undefined,
        meetingDate: meetingDate || undefined,
        participants: cleanedParticipants,
      };
      const input = adapterId === 'upload' && uploadedFile
        ? {
            ...baseInput,
            filename: uploadedFile.name,
            mimeType: uploadedFile.mimeType,
            byteCount: uploadedFile.byteCount,
          }
        : baseInput;

      const createRes = await fetch('/api/portal/brain/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapterId,
          input,
          ...(link?.type === 'company' && { companyId: link.id }),
          ...(link?.type === 'deal' && { dealId: link.id }),
        }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.success) {
        setError(createJson.message || 'No se pudo crear la comunicación.');
        return;
      }

      const meetingId = createJson.data.id;

      if (!alsoProcess) {
        router.push(`/portal/brain/communications/${meetingId}`);
        return;
      }

      setProcessing(true);
      const procRes = await fetch(`/api/portal/brain/communications/${meetingId}/process`, { method: 'POST' });
      const procJson = await procRes.json();
      if (!procRes.ok || !procJson.success) {
        setError(`Comunicación creada, pero el procesamiento con IA falló: ${procJson.message || 'error desconocido'}`);
        router.push(`/portal/brain/communications/${meetingId}`);
        return;
      }
      router.push(`/portal/brain/communications/${meetingId}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setCreating(false);
      setProcessing(false);
    }
  };

  const selectedAdapter = adapters.find((a) => a.id === adapterId);

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div>
        <Link
          href="/portal/brain/communications"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Volver a comunicaciones
        </Link>
        <PortalPageHeader
          eyebrow="Cerebro de empresa"
          title="Nueva nota"
        />
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Source picker (Phase 2: paste only; Phase 2b/c add upload + Google Doc) */}
      <Section title="Fuente" icon="input">
        <div className="grid sm:grid-cols-3 gap-2">
          {adapters.map((a) => (
            <button
              key={a.id}
              onClick={() => setAdapterId(a.id)}
              className={`text-left rounded-md border p-3 transition-colors ${
                adapterId === a.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className="material-icons text-base text-primary">{a.icon}</span>
                {a.label}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
            </button>
          ))}
        </div>
        {selectedAdapter && adapters.length === 1 && (
          <p className="text-xs text-muted-foreground mt-2">
            Más fuentes (subida de archivos, Google Docs, vigilancia de Drive) llegarán en fases próximas.
          </p>
        )}
      </Section>

      {/* Title + date */}
      <Section title="Detalles" icon="info">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Título (opcional)" help="Si se deja en blanco, se usa un título con marca de tiempo.">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="p. ej. Revisión Q1 de Acme"
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </Field>
          <Field label="Fecha (opcional)" htmlFor="communication-date">
            <input
              id="communication-date"
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </Field>
        </div>
      </Section>

      {/* Relationship link */}
      <Section title="Relación vinculada (opcional)" icon="group_work">
        <RelationshipPicker
          value={link}
          onChange={setLink}
        />
      </Section>

      {/* Participants */}
      <Section title="Participantes (opcional)" icon="group">
        <div className="space-y-2">
          {participants.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                type="text"
                value={p.name}
                onChange={(e) => updateParticipant(i, { name: e.target.value })}
                placeholder="Nombre"
                className="rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              <input
                type="email"
                value={p.email}
                onChange={(e) => updateParticipant(i, { email: e.target.value })}
                placeholder="email@example.com"
                className="rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
              <button
                onClick={() => removeParticipant(i)}
                disabled={participants.length === 1}
                className="rounded-xl border border-border bg-card px-2 py-2 text-muted-foreground hover:border-foreground/25 disabled:opacity-30 inline-flex items-center justify-center"
                aria-label="Quitar participante"
              >
                <span className="material-icons text-base">remove</span>
              </button>
            </div>
          ))}
          <button
            onClick={addParticipant}
            className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">add</span>
            Añadir participante
          </button>
        </div>
      </Section>

      {/* Transcript / file upload */}
      <Section
        title={adapterId === 'upload' ? 'Archivo' : 'Transcripción'}
        icon={adapterId === 'upload' ? 'upload_file' : 'description'}
      >
        {adapterId === 'upload' && (
          <FilePicker
            onLoaded={(text, fileInfo) => {
              setTranscript(text);
              setUploadedFile(fileInfo);
              setError(null);
            }}
            onError={(msg) => setError(msg)}
            current={uploadedFile}
            onClear={() => { setUploadedFile(null); setTranscript(''); }}
          />
        )}
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={adapterId === 'upload' ? 8 : 14}
          placeholder={adapterId === 'upload' ? 'El texto del archivo procesado aparece aquí. Edítalo si hace falta.' : 'Pega aquí notas de la comunicación, transcripción o texto de la grabación…'}
          className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground font-mono outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {transcript.length.toLocaleString()} caracteres. Las transcripciones largas (&gt;60k caracteres) se truncarán.
        </p>
      </Section>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={() => submit(false)}
          disabled={creating || !transcript.trim()}
          className={`${pBtnGhost} disabled:opacity-50`}
        >
          Guardar como borrador
        </button>
        <button
          onClick={() => submit(true)}
          disabled={creating || !transcript.trim()}
          className={pBtnPrimary}
        >
          {processing
            ? <><span className="material-icons animate-spin text-base">autorenew</span>Procesando…</>
            : creating
              ? <><span className="material-icons animate-spin text-base">autorenew</span>Guardando…</>
              : <><span className="material-icons text-base">auto_awesome</span>Guardar y procesar con IA</>
          }
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <h2 className={`${pSectionTitle} flex items-center gap-2 mb-3`}>
        <span className="material-icons text-base text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  help,
  htmlFor,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground mb-1">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
    </div>
  );
}

interface CrmSuggestionsResponse {
  companies: { id: number; name: string; industry: string | null; hasOverlay: boolean }[];
  deals: { id: number; title: string; companyName: string | null; hasOverlay: boolean }[];
}

function RelationshipPicker({
  value,
  onChange,
}: {
  value: { type: 'company' | 'deal'; id: number; name: string } | null;
  onChange: (v: { type: 'company' | 'deal'; id: number; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrmSuggestionsResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      fetch(`/api/portal/brain/crm-suggestions?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((j) => { if (j.success) setResults(j.data); })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  if (value) {
    return (
      <div className="flex items-center justify-between bg-muted/30 border border-border rounded-2xl p-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-icons text-base text-muted-foreground">{value.type === 'company' ? 'business' : 'handshake'}</span>
          <span className="text-sm text-foreground truncate">{value.name}</span>
          <span className="text-xs text-muted-foreground">({value.type})</span>
        </div>
        <button
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"
        >
          <span className="material-icons text-sm">close</span>Limpiar</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:bg-accent inline-flex items-center gap-1.5"
      >
        <span className="material-icons text-base">link</span>
        Vincular a una empresa u oportunidad del CRM…
      </button>
    );
  }

  return (
    <div className="space-y-2 border border-border rounded-2xl p-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar empresas u oportunidades…"
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
        autoFocus
      />
      <div className="max-h-56 overflow-auto space-y-1">
        {results?.companies.map((c) => (
          <button
            key={`co${c.id}`}
            onClick={() => { onChange({ type: 'company', id: c.id, name: c.name }); setOpen(false); }}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center gap-1.5"
          >
            <span className="material-icons text-base text-muted-foreground">business</span>
            <span className="truncate">{c.name}</span>
            {c.industry && <span className="text-xs text-muted-foreground truncate">· {c.industry}</span>}
          </button>
        ))}
        {results?.deals.map((d) => (
          <button
            key={`dl${d.id}`}
            onClick={() => { onChange({ type: 'deal', id: d.id, name: d.title }); setOpen(false); }}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent text-sm flex items-center gap-1.5"
          >
            <span className="material-icons text-base text-muted-foreground">handshake</span>
            <span className="truncate">{d.title}</span>
            {d.companyName && <span className="text-xs text-muted-foreground truncate">· {d.companyName}</span>}
          </button>
        ))}
        {results && results.companies.length === 0 && results.deals.length === 0 && (
          <p className="text-xs text-muted-foreground py-3 text-center">Sin resultados.</p>
        )}
      </div>
      <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
    </div>
  );
}

const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.vtt', '.srt'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function FilePicker({
  onLoaded,
  onError,
  current,
  onClear,
}: {
  onLoaded: (text: string, info: { name: string; mimeType: string; byteCount: number }) => void;
  onError: (msg: string) => void;
  current: { name: string; mimeType: string; byteCount: number } | null;
  onClear: () => void;
}) {
  const handleFile = async (file: File) => {
    onError('');
    if (file.size > MAX_FILE_BYTES) {
      onError('El archivo supera los 5 MB.');
      return;
    }
    const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      onError(`Tipo de archivo no admitido ${ext}. Permitidos: ${ACCEPTED_EXTENSIONS.join(', ')}`);
      return;
    }
    try {
      const raw = await file.text();
      const cleaned = ext === '.vtt' ? stripVtt(raw) : ext === '.srt' ? stripSrt(raw) : raw;
      const trimmed = cleaned.trim();
      if (!trimmed) {
        onError('El archivo procesado está vacío.');
        return;
      }
      onLoaded(trimmed, { name: file.name, mimeType: file.type || 'text/plain', byteCount: file.size });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
  };

  if (current) {
    return (
      <div className="mb-3 flex items-center justify-between bg-muted/30 border border-border rounded-2xl p-3">
        <div className="flex items-center gap-2 text-sm text-foreground min-w-0">
          <span className="material-icons text-base text-muted-foreground">description</span>
          <span className="truncate">{current.name}</span>
          <span className="text-xs text-muted-foreground">({(current.byteCount / 1024).toFixed(1)} KB)</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5"
        >
          <span className="material-icons text-sm">close</span>Limpiar</button>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-border rounded-2xl p-6 cursor-pointer hover:bg-accent/30 transition-colors">
        <span className="material-icons text-3xl text-muted-foreground">cloud_upload</span>
        <span className="text-sm text-foreground font-medium">Elegir un archivo</span>
        <span className="text-xs text-muted-foreground">{ACCEPTED_EXTENSIONS.join(', ')} · hasta 5 MB</span>
        <input
          type="file"
          className="hidden"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>
    </div>
  );
}

function stripVtt(text: string): string {
  // Remove WEBVTT header, cue identifiers, and timestamp lines (00:00:00.000 --> 00:00:00.000).
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^WEBVTT/i.test(line)) continue;
    if (/^\d{2}:\d{2}(?::\d{2})?\.\d+\s+-->/.test(line)) continue;
    if (/^[A-Za-z0-9_-]+$/.test(line) && /\d/.test(line) && line.length < 30) continue; // probably a cue id
    if (/^NOTE\b/i.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripSrt(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\d+$/.test(line.trim())) continue; // sequence number
    if (/^\d{2}:\d{2}:\d{2},\d+\s+-->/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
