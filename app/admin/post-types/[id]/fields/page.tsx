'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface CustomField {
  id: number;
  postTypeId: number;
  parentId: number | null;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  order: number;
}

interface PostType {
  id: number;
  name: string;
  slug: string;
}

const fieldTypes = [
  { value: 'text', label: 'Texto' },
  { value: 'textarea', label: 'Área de texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Campo de selección' },
  { value: 'checkbox', label: 'Casilla' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Correo' },
  { value: 'image', label: 'URL de imagen' },
  { value: 'user_select', label: 'Selector de usuario' },
  { value: 'repeater', label: 'Repetidor' },
  { value: 'group', label: 'Grupo de campos' },
];

export default function CustomFieldsPage() {
  const params = useParams();
  const router = useRouter();
  const postTypeId = parseInt(params.id as string);

  const [postType, setPostType] = useState<PostType | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    fieldType: 'text',
    options: [] as string[],
    optionsText: '',
    required: false,
    defaultValue: '',
    helpText: '',
    order: 0,
    parentId: null as number | null,
  });

  const fetchPostType = async () => {
    const response = await fetch(`/api/post-types/${postTypeId}`);
    const data = await response.json();
    if (data.success) {
      setPostType(data.data);
    }
  };

  const fetchCustomFields = async () => {
    const response = await fetch(`/api/custom-fields?postTypeId=${postTypeId}`);
    const data = await response.json();
    if (data.success) {
      setCustomFields(data.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPostType();
    fetchCustomFields();
  }, [postTypeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isNaN(postTypeId)) {
      setError('ID de tipo de publicación no válido');
      return;
    }

    setSubmitting(true);

    const url = editingField ? `/api/custom-fields/${editingField.id}` : '/api/custom-fields';
    const method = editingField ? 'PUT' : 'POST';

    // Parse options from text if select field type
    const options = ['select'].includes(formData.fieldType) && formData.optionsText
      ? formData.optionsText.split('\n').map(o => o.trim()).filter(o => o.length > 0)
      : null;

    const submitData = {
      postTypeId,
      parentId: formData.parentId || null,
      name: formData.name,
      slug: formData.slug,
      fieldType: formData.fieldType,
      options,
      required: formData.required,
      defaultValue: formData.defaultValue || null,
      helpText: formData.helpText || null,
      order: formData.order,
    };

    console.log('Submitting custom field:', submitData);

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        await fetchCustomFields();
        resetForm();
      } else {
        const text = await response.text();
        console.error('API error response text:', text);

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: `Solicitud fallida con estado ${response.status}` };
        }

        console.error('API error:', data);
        setError(data.error || 'Error al guardar el campo personalizado');
      }
    } catch (error) {
      console.error('Request failed:', error);
      setError('Error de red: no se pudo guardar el campo personalizado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (field: CustomField) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      slug: field.slug,
      fieldType: field.fieldType,
      options: field.options || [],
      optionsText: field.options ? field.options.join('\n') : '',
      required: field.required,
      defaultValue: field.defaultValue || '',
      helpText: field.helpText || '',
      order: field.order,
      parentId: field.parentId,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este campo personalizado?')) return;
    const response = await fetch(`/api/custom-fields/${id}`, { method: 'DELETE' });
    if (response.ok) {
      fetchCustomFields();
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingField(null);
    setError('');
    setFormData({
      name: '',
      slug: '',
      fieldType: 'text',
      options: [],
      optionsText: '',
      required: false,
      defaultValue: '',
      helpText: '',
      order: customFields.length,
      parentId: null,
    });
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  if (loading || !postType) {
    return <div className="p-8">Cargando...</div>;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/admin/post-types"
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 mb-2"
            >
              <span className="material-icons text-sm">arrow_back</span>
              Volver a tipos de publicación
            </Link>
            <h1 className="text-3xl font-bold text-foreground">
              Campos personalizados: {postType.name}
            </h1>
          </div>
          <button
            onClick={() => {
              if (showForm) {
                // Closing the form
                resetForm();
              } else {
                // Opening the form
                setShowForm(true);
                setEditingField(null);
                setError('');
                setFormData({
                  name: '',
                  slug: '',
                  fieldType: 'text',
                  options: [],
                  optionsText: '',
                  required: false,
                  defaultValue: '',
                  helpText: '',
                  order: customFields.length,
                  parentId: null,
                });
              }
            }}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-foreground/90"
          >
            {showForm ? 'Cancelar' : 'Añadir campo personalizado'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-card border border-border shadow rounded-lg p-6 space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/50 text-destructive px-4 py-3 rounded-md">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Nombre *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    if (!editingField) {
                      setFormData({ ...formData, name: newName, slug: generateSlug(newName) });
                    } else {
                      setFormData({ ...formData, name: newName });
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  placeholder="p. ej., Nombre del autor"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Slug *</label>
                <input
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  placeholder="p. ej., author_name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Tipo de campo *</label>
                <select
                  value={formData.fieldType}
                  onChange={(e) => setFormData({ ...formData, fieldType: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                >
                  {fieldTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Pedido</label>
                <input
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>
            </div>

            {formData.fieldType === 'select' && (
              <div>
                <label className="block text-sm font-medium text-foreground">Opciones (una por línea)</label>
                <textarea
                  value={formData.optionsText}
                  onChange={(e) => setFormData({ ...formData, optionsText: e.target.value })}
                  rows={4}
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  placeholder="Opción 1&#10;Opción 2&#10;Opción 3"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground">Texto de ayuda</label>
              <input
                type="text"
                value={formData.helpText}
                onChange={(e) => setFormData({ ...formData, helpText: e.target.value })}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                placeholder="Información adicional sobre este campo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">Valor predeterminado</label>
              <input
                type="text"
                value={formData.defaultValue}
                onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="required"
                checked={formData.required}
                onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="required" className="ml-2 block text-sm text-foreground">
                Campo obligatorio
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Guardando...' : editingField ? 'Actualizar campo' : 'Crear campo'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent disabled:opacity-50"
              >Cancelar</button>
            </div>
          </form>
        )}

        <div className="bg-card border border-border shadow overflow-hidden rounded-lg">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Pedido</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Obligatorio</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {customFields.filter(f => !f.parentId).flatMap((field) => {
                const isContainer = field.fieldType === 'repeater' || field.fieldType === 'group';
                const children = isContainer ? customFields.filter(f => f.parentId === field.id) : [];
                return [
                  <tr key={field.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {field.order}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isContainer && (
                          <span className="material-icons text-sm text-muted-foreground">
                            {field.fieldType === 'repeater' ? 'repeat' : 'folder'}
                          </span>
                        )}
                        <div>
                          <div className="text-sm font-medium text-foreground">{field.name}</div>
                          {field.helpText && (
                            <div className="text-sm text-muted-foreground">{field.helpText}</div>
                          )}
                          {isContainer && (
                            <div className="text-xs text-muted-foreground">{children.length} subcampo{children.length !== 1 ? 's' : ''}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-muted-foreground">
                      {field.slug}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-primary/10 text-primary">
                        {field.fieldType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {field.required ? (
                        <span className="material-icons text-green-600 text-sm">check_circle</span>
                      ) : (
                        <span className="material-icons text-muted-foreground text-sm">cancel</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      {isContainer && (
                        <button
                          onClick={() => {
                            setShowForm(true);
                            setEditingField(null);
                            setError('');
                            setFormData({
                              name: '',
                              slug: '',
                              fieldType: 'text',
                              options: [],
                              optionsText: '',
                              required: false,
                              defaultValue: '',
                              helpText: '',
                              order: children.length,
                              parentId: field.id,
                            });
                          }}
                          className="text-primary hover:text-primary/80"
                        >
                          + Subcampo
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(field)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >Editar</button>
                      <button
                        onClick={() => handleDelete(field.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >Eliminar</button>
                    </td>
                  </tr>,
                  ...children.map((child) => (
                    <tr key={child.id} className="bg-muted/30">
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground pl-12">
                        {child.order}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap pl-12">
                        <div className="flex items-center gap-1.5">
                          <span className="material-icons text-xs text-muted-foreground">subdirectory_arrow_right</span>
                          <div>
                            <div className="text-sm font-medium text-foreground">{child.name}</div>
                            {child.helpText && (
                              <div className="text-sm text-muted-foreground">{child.helpText}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm font-mono text-muted-foreground">
                        {child.slug}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-primary/10 text-primary">
                          {child.fieldType}
                        </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-foreground">
                        {child.required ? (
                          <span className="material-icons text-green-600 text-sm">check_circle</span>
                        ) : (
                          <span className="material-icons text-muted-foreground text-sm">cancel</span>
                        )}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right text-sm space-x-2">
                        <button
                          onClick={() => handleEdit(child)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >Editar</button>
                        <button
                          onClick={() => handleDelete(child.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >Eliminar</button>
                      </td>
                    </tr>
                  )),
                ];
              })}
              {customFields.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    Aún no hay campos personalizados. ¡Añade tu primer campo para empezar!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
