'use client';

import { useState } from 'react';
import { formatBytes } from '@/lib/utils/bytes';

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

interface MediaDetailModalProps {
  media: MediaItem;
  onClose: () => void;
  onUpdate: () => void;
}

export default function MediaDetailModal({
  media,
  onClose,
  onUpdate,
}: MediaDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [alt, setAlt] = useState(media.alt || '');
  const [caption, setCaption] = useState(media.caption || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/media/${media.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt, caption }),
      });

      if (response.ok) {
        setEditing(false);
        onUpdate();
      }
    } catch (error) {
      alert('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Seguro que quieres eliminar este archivo?')) return;

    try {
      const response = await fetch(`/api/media/${media.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onUpdate();
        onClose();
      }
    } catch (error) {
      alert('Error al eliminar');
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(media.url);
    alert('URL copiada al portapapeles');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-foreground">Detalles del archivo</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons">close</span>
            </button>
          </div>

          {/* Preview */}
          <div className="bg-muted rounded-lg p-4 flex items-center justify-center">
            {media.mimeType.startsWith('image/') ? (
              <img
                src={media.url}
                alt={media.alt || media.filename}
                className="max-h-96"
              />
            ) : media.mimeType.startsWith('video/') ? (
              <video src={media.url} controls className="max-h-96" />
            ) : (
              <div className="text-6xl">
                <span className="material-icons text-6xl text-muted-foreground">description</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Nombre del archivo:</span> {media.filename}
            </div>
            <div>
              <span className="font-medium">Tipo:</span> {media.mimeType}
            </div>
            <div>
              <span className="font-medium">Tamaño:</span> {formatBytes(media.fileSize)}
            </div>
            {media.width && media.height && (
              <div>
                <span className="font-medium">Dimensiones:</span> {media.width} ×{' '}
                {media.height}
              </div>
            )}
            <div>
              <span className="font-medium">Subido:</span>{' '}
              {new Date(media.createdAt).toLocaleString()}
            </div>
          </div>

          {/* Editable Fields */}
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Texto alternativo
                </label>
                <input
                  type="text"
                  value={alt}
                  onChange={(e) => setAlt(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Descripción
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm bg-card border border-border rounded-md hover:bg-accent"
                >Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {media.alt && (
                <div>
                  <span className="font-medium text-sm">Texto alternativo:</span> {media.alt}
                </div>
              )}
              {media.caption && (
                <div>
                  <span className="font-medium text-sm">Descripción:</span>{' '}
                  {media.caption}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-border">
            <button
              onClick={copyUrl}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Copiar URL
            </button>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 text-sm bg-card border border-border rounded-md hover:bg-accent"
              >
                Editar metadatos
              </button>
            )}
            <button
              onClick={handleDelete}
              className="ml-auto px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            >Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
