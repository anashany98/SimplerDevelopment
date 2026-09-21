'use client';

import { useState, useEffect } from 'react';
import MediaGrid from '@/components/admin/MediaGrid';
import MediaUploadModal from '@/components/admin/MediaUploadModal';

interface MediaItem {
  id: number;
  filename: string;
  url: string;
  mimeType: string;
  fileSize: number;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  caption?: string | null;
  createdAt: string;
}

export default function MediaLibraryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [clients, setClients] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const limit = 20;

  useEffect(() => {
    // Client filter options — the admin panel is cross-tenant and this page
    // talks to the staff-scoped /api/admin/media (the portal endpoint 403s for
    // staff sessions, which is why the library used to render empty).
    fetch('/api/admin/portal/clients?limit=100')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setClients(
            (res.data as Array<{ id: number; company: string | null; userName: string | null; userEmail: string | null }>).map((c) => ({
              id: c.id,
              label: c.company || c.userName || c.userEmail || `Cliente #${c.id}`,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [search, filter, offset, selectedClientId]);

  const fetchMedia = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (search) params.append('search', search);
    if (filter !== 'all') params.append('mimeType', filter);
    if (selectedClientId) params.append('clientId', selectedClientId);

    const response = await fetch(`/api/admin/media?${params}`);
    const data = await response.json();

    if (data.success) {
      setMedia(data.data);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  };

  const handleUploadComplete = () => {
    setShowUpload(false);
    fetchMedia();
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Biblioteca de medios</h1>
          <button
            onClick={() => setShowUpload(true)}
            disabled={!selectedClientId}
            title={selectedClientId ? undefined : 'Selecciona un cliente para subir medios'}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Subir medios
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card border border-border p-4 rounded-lg shadow space-y-4">
          <input
            type="text"
            placeholder="Busca por nombre de archivo, texto alternativo o pie de foto..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />

          <select
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setOffset(0);
            }}
            aria-label="Filtrar por cliente"
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            {[
              { key: 'all', label: 'Todos' },
              { key: 'image', label: 'Imágenes' },
              { key: 'video', label: 'Vídeos' },
              { key: 'application', label: 'Documentos' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => {
                  setFilter(key);
                  setOffset(0);
                }}
                className={`px-4 py-2 text-sm rounded-md ${
                  filter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Media Grid */}
        {loading ? (
          <div className="text-center py-12">Cargando...</div>
        ) : (
          <MediaGrid media={media} onUpdate={fetchMedia} />
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex justify-center gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-4 py-2 text-sm border border-border rounded-md disabled:opacity-50 hover:bg-accent"
            >Anterior</button>
            <span className="px-4 py-2 text-sm">
              {offset + 1} - {Math.min(offset + limit, total)} de {total}
            </span>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-4 py-2 text-sm border border-border rounded-md disabled:opacity-50 hover:bg-accent"
            >Siguiente</button>
          </div>
        )}

        {showUpload && (
          <MediaUploadModal
            onClose={() => setShowUpload(false)}
            onComplete={handleUploadComplete}
            apiEndpoint={`/api/admin/media/upload?clientId=${selectedClientId}`}
          />
        )}
      </div>
    </main>
  );
}
