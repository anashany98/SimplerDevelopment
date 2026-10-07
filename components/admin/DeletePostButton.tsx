'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeletePostButton({ postId }: { postId: number }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('¿Seguro que quieres eliminar esta entrada?')) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.refresh();
      } else {
        alert('No se pudo eliminar la entrada');
      }
    } catch (error) {
      alert('Se ha producido un error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
    >
      {deleting ? 'Eliminando...' : 'Eliminar'}
    </button>
  );
}
